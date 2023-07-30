import $ from 'jquery';
import _ from 'underscore';

import {Container} from 'golden-layout';
import {Hub} from '../hub.js';

import TomSelect from 'tom-select';
import {Toggles} from '../widgets/toggles.js';

import * as monaco from 'monaco-editor';
import {MonacoPane} from './pane.js';
import {MonacoPaneState} from './pane.interfaces.js';
import * as monacoConfig from '../monaco-config.js';

import {CflatDumpFiltersState, CflatDumpViewState, CflatDumpViewSelectedPass} from './cflatdump-view.interfaces.js';

import {ga} from '../analytics.js';
import {assert} from '../assert.js';

export class CflatDump extends MonacoPane<monaco.editor.IStandaloneCodeEditor, CflatDumpViewState> {
    selectize: TomSelect;
    uiIsReady: boolean;
    filters: Toggles;
    dumpFiltersButtons: JQuery<HTMLElement>;
    dumpInliningButton: JQuery<HTMLElement>;
    dumpInliningTitle: string;
    dumpCodeGenButton: JQuery<HTMLElement>;
    dumpCodeGenTitle: string;
    inhibitPassSelect = false;
    cursorSelectionThrottledFunction: ((e: any) => void) & _.Cancelable;
    selectedPass: string | null = null;

    constructor(hub: Hub, container: Container, state: CflatDumpViewState & MonacoPaneState) {
        super(hub, container, state);

        if (state.selectedPass && typeof state.selectedPass === 'string') {
            // To keep URL format stable wrt CflatDump, only a string of the form 'r.expand' is stored.
            // Old links also have the pass number prefixed but this can be ignored.
            // Create the object that will be used instead of this bare string.
            const selectedPassRe = /[0-9]*(i|c)\.([\w-_]*)/;
            const passType = {
                i: 'inlining',
                c: 'code-generation',
            };
            const match = state.selectedPass.match(selectedPassRe);
            if (match) {
                const selectedPassO: CflatDumpViewSelectedPass = {
                    filename_suffix: match[1] + '.' + match[2],
                    name: match[2] + ' (' + passType[match[1]] + ')',
                    command_prefix: '-cflat-' + passType[match[1]] + '-' + match[2],

                    // FIXME(dkm): maybe this could be avoided by better typing.
                    selectedPass: null,
                };

                this.eventHub.emit('cflatDumpPassSelected', this.compilerInfo.compilerId, selectedPassO, false);
            }
        }

        // until we get our first result from compilation backend with all fields,
        // disable UI callbacks.
        this.uiIsReady = false;
        this.onUiNotReady();

        this.eventHub.emit('cflatDumpFiltersChanged', this.compilerInfo.compilerId, this.getEffectiveFilters(), false);

        this.updateButtons();
        this.updateState();

        // UI is ready, request compilation to get passes list and
        // current output (if any)
        this.eventHub.emit('cflatDumpUIInit', this.compilerInfo.compilerId);
    }

    override initializeCompilerInfo(state: Record<string, any>) {
        super.initializeCompilerInfo(state);

        if (!state.id && state._compilerid) this.compilerInfo.compilerId = state._compilerid;
        if (!state.editorid && state._editorid) this.compilerInfo.editorId = state._editorid;
        if (!state.compilerName && state._compilerName) this.compilerInfo.compilerName = state._compilerName;
        if (!state.treeid && state._treeid) state.treeId = state._treeid;
    }

    override getInitialHTML(): string {
        return $('#cflatdump').html();
    }

    override createEditor(editorRoot: HTMLElement): monaco.editor.IStandaloneCodeEditor {
        return monaco.editor.create(
            editorRoot,
            monacoConfig.extendConfig({
                readOnly: true,
                glyphMargin: true,
                lineNumbersMinChars: 3,
                dropdownParent: 'body',
            }),
        );
    }

    override registerOpeningAnalyticsEvent() {
        ga.proxy('send', {
            hitType: 'event',
            eventCategory: 'OpenViewPane',
            eventAction: 'cflatDump',
        });
    }

    override registerButtons(state: CflatDumpViewState & MonacoPaneState) {
        super.registerButtons(state);

        const cflatdump_picker = this.domRoot.find('.cflatdump-pass-picker').get(0);
        if (!(cflatdump_picker instanceof HTMLSelectElement)) {
            throw new Error('.cflatdump-pass-picker is not an HTMLSelectElement');
        }
        assert(cflatdump_picker instanceof HTMLSelectElement);
        this.selectize = new TomSelect(cflatdump_picker, {
            sortField: undefined, // do not sort
            valueField: 'name',
            labelField: 'name',
            searchField: ['name'],
            options: [],
            items: [],
            plugins: ['input_autogrow'],
            maxOptions: 500,
        });

        this.filters = new Toggles(this.domRoot.find('.dump-filters'), state as any as Record<string, boolean>);

        this.dumpFiltersButtons = this.domRoot.find('.dump-filters .btn');

        this.dumpInliningButton = this.domRoot.find("[data-bind='inliningDump']");
        this.dumpInliningTitle = this.dumpInliningButton.prop('title');

        this.dumpCodeGenButton = this.domRoot.find("[data-bind='codeGenDump']");
        this.dumpCodeGenTitle = this.dumpCodeGenButton.prop('title');
    }

    override registerCallbacks() {
        this.filters.on('change', this.onFilterChange.bind(this));
        this.selectize.on('change', this.onPassSelect.bind(this));

        this.eventHub.emit('cflatDumpViewOpened', this.compilerInfo.compilerId);
        this.eventHub.emit('requestSettings');

        this.container.on('resize', this.resize, this);
        this.container.on('shown', this.resize, this);

        this.cursorSelectionThrottledFunction = _.throttle(this.onDidChangeCursorSelection.bind(this), 500);
        this.editor.onDidChangeCursorSelection(e => {
            this.cursorSelectionThrottledFunction(e);
        });
    }

    updateButtons() {
        const formatButtonTitle = (button, title) =>
            button.prop('title', '[' + (button.hasClass('active') ? 'ON' : 'OFF') + '] ' + title);
        formatButtonTitle(this.dumpInliningButton, this.dumpInliningTitle);
        formatButtonTitle(this.dumpCodeGenButton, this.dumpCodeGenTitle);
    }

    // Disable view's menu when invalid compiler has been
    // selected after view is opened.
    onUiNotReady() {
        // disable drop down menu and buttons
        this.selectize.disable();
        this.dumpFiltersButtons.prop('disabled', true);
    }

    onUiReady() {
        // enable drop down menu and buttons
        this.selectize.enable();

        this.dumpFiltersButtons.prop('disabled', false);
    }

    onPassSelect(passId: string) {
        const selectedPass = this.selectize.options[passId] as unknown as CflatDumpViewSelectedPass;

        if (this.inhibitPassSelect !== true) {
            this.eventHub.emit('cflatDumpPassSelected', this.compilerInfo.compilerId, selectedPass, true);
        }

        // To keep shared URL compatible, we keep on storing only a string in the
        // state and stick to the original format.
        // Previously, we were simply storing the full file suffix (the part after [...]):
        //    [file.c.]123t.expand
        // We don't have the number now, but we can store the file suffix without this number
        // (the number is useless and should probably have never been there in the
        // first place).

        this.selectedPass = selectedPass.filename_suffix;
        this.updateState();
    }

    // Called after result from new compilation received
    // if cflatDumpOutput is false, cleans the select menu
    updatePass(filters, selectize, cflatDumpOutput) {
        const passes = cflatDumpOutput ? cflatDumpOutput.all : [];

        // we are changing selectize but don't want any callback to
        // trigger new compilation
        this.inhibitPassSelect = true;

        selectize.clear(true);
        selectize.clearOptions();

        for (const p of passes) {
            selectize.addOption(p);
        }

        if (cflatDumpOutput.selectedPass) selectize.addItem(cflatDumpOutput.selectedPass.name, true);
        else selectize.clear(true);

        this.eventHub.emit('cflatDumpPassSelected', this.compilerInfo.compilerId, cflatDumpOutput.selectedPass, false);

        this.inhibitPassSelect = false;
    }

    override onCompileResult(id, compiler, result) {
        if (this.compilerInfo.compilerId !== id || !compiler) return;

        const model = this.editor.getModel();
        if (model) {
            if (result.cflatDumpOutput && result.cflatDumpOutput.syntaxHighlight) {
                monaco.editor.setModelLanguage(model, 'cflatdump-inlining');
            } else {
                monaco.editor.setModelLanguage(model, 'plaintext');
            }
        }
        if (compiler.supportsCflatDump && result.cflatDumpOutput) {
            const currOutput = result.cflatDumpOutput.currentPassOutput;

            // if result contains empty selected pass, probably means
            // we requested an invalid/outdated pass.
            if (!result.cflatDumpOutput.selectedPass) {
                this.selectize.clear(true);
                this.selectedPass = null;
            }
            this.updatePass(this.filters, this.selectize, result.cflatDumpOutput);
            this.showCflatDumpResults(currOutput);

            // enable UI on first successful compilation or after an invalid compiler selection (eg. clang)
            if (!this.uiIsReady) {
                this.uiIsReady = true;
                this.onUiReady();
            }
        } else {
            this.selectize.clear(true);
            this.selectedPass = null;
            this.updatePass(this.filters, this.selectize, false);
            this.uiIsReady = false;
            this.onUiNotReady();
            if (!compiler.supportsCflatDump) {
                this.showCflatDumpResults('<Inlining/CodeGen output is not supported for this compiler (Cflat only)>');
            } else {
                this.showCflatDumpResults('<Inlining/CodeGen output is empty>');
            }
        }
        this.updateState();
    }

    override getDefaultPaneName() {
        return 'Cflat Inlining/CodeGen Viewer';
    }

    showCflatDumpResults(results) {
        this.editor.setValue(results);

        if (!this.isAwaitingInitialResults) {
            if (this.selection) {
                this.editor.setSelection(this.selection);
                this.editor.revealLinesInCenter(this.selection.startLineNumber, this.selection.endLineNumber);
            }
            this.isAwaitingInitialResults = true;
        }
    }

    override onCompiler(compilerId: number, compiler, options: unknown, editorId: number, treeId: number) {
        if (compilerId === this.compilerInfo.compilerId) {
            this.compilerInfo.compilerName = compiler ? compiler.name : '';
            this.compilerInfo.editorId = editorId;
            this.compilerInfo.treeId = treeId;
            this.updateTitle();
            // TODO(jeremy-rifkin): Panes like ast-view handle the case here where the compiler doesn't support
            // the view
        }
    }

    override onCompilerClose(id) {
        if (id === this.compilerInfo.compilerId) {
            // We can't immediately close as an outer loop somewhere in GoldenLayout is iterating over
            // the hierarchy. We can't modify while it's being iterated over.
            this.close();
            _.defer(function (self) {
                self.container.close();
            }, this);
        }
    }

    getEffectiveFilters(): CflatDumpFiltersState {
        // This cast only works if cflatdump.pug and cflatdump-view.interfaces are
        // kept synchronized. See comment in cflatdump-view.interfaces.ts.

        return this.filters.get() as unknown as CflatDumpFiltersState;
    }

    onFilterChange() {
        this.updateState();
        this.updateButtons();

        if (this.inhibitPassSelect !== true) {
            this.eventHub.emit(
                'cflatDumpFiltersChanged',
                this.compilerInfo.compilerId,
                this.getEffectiveFilters(),
                true,
            );
        }
    }

    override getCurrentState() {
        const parent = super.getCurrentState();
        const filters = this.getEffectiveFilters(); // TODO: Validate somehow?
        const state: MonacoPaneState & CflatDumpViewState = {
            // filters needs to come first, the entire state is given to the toggles and we don't want to override
            // properties such as selectedPass with obsolete values
            ...filters,

            selectedPass: this.selectedPass,

            // See FIXME(dkm) comment in cflatdump-view.interfaces.ts.
            filename_suffix: this.selectedPass,
            name: null,
            command_prefix: null,

            ...parent,
        };
        // TODO(jeremy-rifkin)
        return state as any;
    }

    override close() {
        this.eventHub.unsubscribe();
        this.eventHub.emit('cflatDumpViewClosed', this.compilerInfo.compilerId);
        this.editor.dispose();
    }
}
