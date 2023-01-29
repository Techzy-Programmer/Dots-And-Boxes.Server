import { readFileSync, writeFileSync, readdirSync, unlinkSync } from 'fs';

let pkg = './package.json';
let fileStr = readFileSync(pkg, 'utf-8');
const packageData = JSON.parse(fileStr);

// Let's treat the package.json file for production ready
packageData.scripts = {
    start: "node app.js",
    build: "echo 'Package Already Built'"
};

delete packageData.devDependencies;
delete packageData.eslintConfig;

// Ok rewrite the edited content back to the file
writeFileSync(pkg, JSON.stringify(packageData));
console.log("'package.json' file treated.")

// Let's delete source & extra build files
const workDir = __dirname;
const files = readdirSync(workDir);
let extsDel = [".ts", ".map", ".sln", ".njsproj"];
let extraFiles = ["package-lock.json", "tsconfig.json"];

files.forEach((file) => {
    let ext = '.' + file.split('.').pop();
    if (extsDel.includes(ext) || extraFiles.includes(file))
        unlinkSync(`${workDir}/${file}`);
});

console.log("Source & Output files deleted.")
