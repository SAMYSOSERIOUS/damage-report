const [maj, min] = process.versions.node.split('.').map(Number);
if (maj < 20 || (maj === 20 && min < 19) || (maj === 21) ) {
  console.error('\n  Damage Report needs Node.js 22 (or 20.19+). You have ' + process.version + '.\n  Install the LTS version from https://nodejs.org , close and reopen PowerShell, then try again.\n  Check with:  node -v\n');
  process.exit(1);
}
