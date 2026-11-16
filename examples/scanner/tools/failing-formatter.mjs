// A formatter that fails: one stderr line and exit 1, used to show that a formatter
// failure is the build failing.

console.error("boom: this formatter always fails");
process.exit(1);
