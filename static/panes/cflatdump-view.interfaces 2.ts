// Extra information used to serialize the state
export interface CflatDumpViewSelectedPass {
    // FIXME(dkm): this type needs to be refactored.
    // In particular, see in cflatdump-view.ts:{constructor, getCurrentState}
    // There is a mix of 'selectedPass' being a filename_prefix and a
    // CflatDumpViewSelectedPass object.
    filename_suffix: string | null;
    name: string | null;
    command_prefix: string | null;
    selectedPass: string | null;
}

// This should reflect the corresponding UI widget in cflatdump.pug
// Each optionButton should have a matching boolean here.
export type CflatDumpFiltersState = {
    inliningDump: boolean;
    codeGenDump: boolean;
};

// state = selected pass + all option flags
export type CflatDumpViewState = CflatDumpFiltersState & CflatDumpViewSelectedPass;
