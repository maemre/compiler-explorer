# In-browser Execution for Compiler Explorer

## What is it?

It is an enhancement feature of Compiler Explorer (CE) by adapting it to support in-browser compilers. The primary
objectives include restructuring the backend by removing the original CE server and integrating WebAssembly (Wasm) code
for compiler execution. Additionally, the project aims to add a new feature of running different compiler passes so that
users can better understand the compiler process. Furthermore, the project implements another functionality to load
different compilers.

## Build process

### Installing Prerequisites

- Download Node.js

1. For macOS user, you can enter the following line in the terminal to download Node.js.

```
brew install node
```

2. For windows or other OS user, you can download and install Node.js from the official website:
   [Download | Node.js](https://nodejs.org/en/download)

### Generating "cflat.js" from farrago repo

- Follow the steps in ["README.md"](https://github.com/maemre/farrago/blob/master/cflat/README.md)

### Running the developer version of this program

```bash
# go to the right directory
cd compiler-explorer/

# run the developer version
make dev EXTRA_ARGS="--language cflat"

```

### What to expect?

- Wait until the terminal shows the following lines.

```
info:   Listening on http://localhost:10240/
info:   Startup duration: 13769ms
info: =======================================
```

- Open the [local webpage](http://localhost:10240/) in any browser
- See the wepage like this
  <img width="1595" alt="Screenshot 2023-08-03 at 18 04 37" src="https://github.com/maemre/compiler-explorer/assets/97008773/117e374a-b61b-4a37-92b3-283a048efd75">

- If you see `<Compilation failed: unreachable>` on the right hand side (as shown below), try to add a new line at the
  very end of your input codes on the left hand window.
  <img width="1600" alt="Screenshot 2023-08-03 at 18 05 52" src="https://github.com/maemre/compiler-explorer/assets/97008773/f36b16da-57a5-4457-9e13-796a248de3a0">

## Test

### Run the test

```bash=
make test
```

### What to expect?

The terminal is going to run more than 520 tests, and Cflat compiler contains 2 tests among them. If you find them
paased as shown below, you are good to go.

```bash=
...
# The cflat part
  Basic compiler setup
    ✔ Should not crash on instantiation

  cflatp compiling
    ✔ Compiles a simple LIR program
...
```
