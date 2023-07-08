// Copyright (c) 2017, Compiler Explorer Authors
// All rights reserved.
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are met:
//
//     * Redistributions of source code must retain the above copyright notice,
//       this list of conditions and the following disclaimer.
//     * Redistributions in binary form must reproduce the above copyright
//       notice, this list of conditions and the following disclaimer in the
//       documentation and/or other materials provided with the distribution.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
// AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
// IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
// ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
// LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
// CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
// SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
// INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
// CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
// ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
// POSSIBILITY OF SUCH DAMAGE.

import {CompilationEnvironment} from '../lib/compilation-env.js';
import {CflatCompiler} from '../lib/compilers/index.js';
import * as utils from '../lib/utils.js';
import {ParsedAsmResultLine} from '../types/asmresult/asmresult.interfaces.js';
import {CompilerInfo} from '../types/compiler.interfaces.js';

import {fs, makeCompilationEnvironment} from './utils.js';

const languages = {
    Cflat: {id: 'Cflat'},
};

const info = {
    exe: null,
    remote: true,
    lang: languages.Cflat.id,
} as unknown as CompilerInfo;

describe('Basic compiler setup', function () {
    let env: CompilationEnvironment;

    before(() => {
        env = makeCompilationEnvironment({languages});
    });

    it('Should not crash on instantiation', function () {
        new CflatCompiler(info, env);
    });

    describe('Forbidden compiler arguments', function () {
        it('CflatCompiler should not allow -d parameter', () => {
            const compiler = new CflatCompiler(info, env);
            compiler.filterUserOptions(['-d', '--something', '--something-else']).should.deep.equal([]);
            compiler.filterUserOptions(['-d', 'something', 'something-else']).should.deep.equal([]);
        });

        it('CflatCompiler should not allow -s parameter', () => {
            const compiler = new CflatCompiler(info, env);
            compiler.filterUserOptions(['-s', '--something', '--something-else']).should.deep.equal([]);
            compiler.filterUserOptions(['-s', 'something', 'something-else']).should.deep.equal([]);
        });

        it('CflatCompiler should not allow --source-path parameter', () => {
            const compiler = new CflatCompiler(info, env);
            compiler.filterUserOptions(['-source-path', '--something', '--something-else']).should.deep.equal([]);
            compiler.filterUserOptions(['-source-path', 'something', 'something-else']).should.deep.equal([]);
        });

        it('CflatCompiler should not allow -sourcepath parameter', () => {
            const compiler = new CflatCompiler(info, env);
            compiler.filterUserOptions(['-sourcepath', '--something', '--something-else']).should.deep.equal([]);
            compiler.filterUserOptions(['-sourcepath', 'something', 'something-else']).should.deep.equal([]);
        });
    });
});

describe('cflatp parsing', () => {
    let compiler: CflatCompiler;
    let env: CompilationEnvironment;
    before(() => {
        env = makeCompilationEnvironment({languages});
        compiler = new CflatCompiler(info, env);
    });

    async function testCflat(baseFolder: string, ...classNames: string[]) {
        const compiler = new CflatCompiler(info, env);

        const asm = classNames.map(className => {
            return {text: fs.readFileSync(`${baseFolder}/${className}.asm`).toString()};
        });

        const output = utils.splitLines(fs.readFileSync(`${baseFolder}/output.asm`).toString());
        const expectedSegments = output.map(line => {
            const match = line.match(/^line (\d+):(.*)$/);
            if (match) {
                return {
                    text: match[2],
                    source: {
                        line: parseInt(match[1]),
                        file: null,
                    },
                };
            }
            return {
                text: line,
                source: null,
            };
        });

        const result = {
            asm,
        };

        const processed = await compiler.processAsm(result, this.filters, this.options);
        processed.should.have.property('asm');
        const asmSegments = (processed as {asm: ParsedAsmResultLine[]}).asm;
        asmSegments.should.deep.equal(expectedSegments);
    }

    it('should handle errors', async () => {
        const result = {
            asm: '<Compilation failed>',
        };
        (await compiler.processAsm(result, null, null)).should.deep.equal([
            {text: '<Compilation failed>', source: null},
        ]);
    });

    // We only use branch.lir for test for now. It could be extended if there are more tests needed in the future.
    it('Parses simple class with one method', () => {
        return Promise.all([testCflat('test/cflat/branch', 'cflatp-branch')]);
    });
});