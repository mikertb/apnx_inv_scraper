/**
 * Used to count total number of valid CSV lines from the list
 * of countries provided as the first command line argument.
 * JSON file must be found inside json/* folder.
 *
 * Usage:
 *
 *     node count_rows.js [file_name.json]
 * 
 */

const fs        = require('fs');
const filename  = process.argv[2] || 'countries_jvector_map.json';
const countries = JSON.parse(fs.readFileSync('json/'+filename));
let valid_lines = 0;

function getFiles(dir){
	let files = fs.readdirSync(dir);
	files.forEach(function(name){
		countRows(dir+'/'+name);
	});
	
}

function countRows(file){
	let lines = (fs.readFileSync(file,{encoding:'utf8'})).split("\n");
	lines.forEach(function(line){
		if(line.length > 40) valid_lines++;
	});
	valid_lines--;
}

function numberWithCommas(x) {
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// Process input country array.
countries.forEach(function(country){
	getFiles('csv/'+country.code);
});

console.log(numberWithCommas(valid_lines));