# data-migration/tools

## fmptools (submodule, patched locally)

`fmptools/` is a submodule of [evanmiller/fmptools](https://github.com/evanmiller/fmptools)
used to extract the legacy CKK FileMaker (.fp7) data to SQLite.

The checkout carries **local patches** (JP text/SCSU handling, fp7 quirks, fmp2sqlite
output fixes) that are not upstream. They are captured in
[`fmptools-local.patch`](fmptools-local.patch) so the state is reproducible:

```bash
git submodule update --init data-migration/tools/fmptools
cd data-migration/tools/fmptools
git apply ../fmptools-local.patch
./autogen.sh && ./configure && make   # builds fmp2sqlite etc.
```

The submodule working tree is expected to stay "dirty" (patched); do not commit
inside the submodule — update `fmptools-local.patch` instead when the patches change:

```bash
cd data-migration/tools/fmptools && git diff > ../fmptools-local.patch
```
