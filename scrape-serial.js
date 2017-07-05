const checkcsv  = require('detect-csv');
const crypto    = require('crypto');
const exec      = require('child_process').exec;
const fs        = require('fs-extra');
const path      = require('path');
const prettyd   = require("pretty-data").pd;
const request   = require('request');

/* File Dependencies */
const config    = JSON.parse(fs.readFileSync('config.json'));
const main_list = process.argv[2] || 'countries_jvector_map.json';
const countries = JSON.parse(fs.readFileSync(path.join(__dirname,'json',main_list)));

// Reference
const total_files  = countries.length * 16;
const cookie_file  = path.join(__dirname,'logs',config.cookie_file);
const device_ids   = ['any','0','2','3'];
const supply_ids   = ['any','0','1','2'];
const device_names = {'any':'any', '0':'desktop', '2':'phone', '3':'tablet'};
const supply_names = {'any':'any', '0':'web', '1':'mobile_web', '2':'mobile_app'};
const date_today   = (new Date()).toISOString().replace(/T\d{2}.+/,"");

var login_attempts = 0;
var completed_files = 0;
var accounted_files = 0;
var accounted_countries = 0;

// Build a list of device and supply combinations per country (16).
var inventory_types = [];
for(let device_id of device_ids) {
    for(let supply_id of supply_ids) inventory_types.push({ device_id: device_id, supply_id: supply_id });
}

/**
 * Makes a single log entry in logs folder.
 * 
 * @param  {String} type    Name of logfile.
 * @param  {String} message Message of a log.
 * @return {Null}
 */
function logEvent(type,message){
    let date = (new Date()).toISOString().replace(/T/, ' ').replace(/\..+/, '')+' UTC';
    let folder = path.join(__dirname,'logs');
    let file = path.join(__dirname,'logs',`${type}.log`);
    let full_text = date+' - '+message+"\n";
    if(!fs.existsSync(folder)) fs.mkdirSync('logs');
    fs.writeFileSync(file,full_text,{flag:'a'});
}

/**
 * Checks if current session is still valid.
 * 
 * @return {Boolean} Returns true if session is valid and false if not.
 */
function isLogged() {
    let dir  = path.join(__dirname,'logs');
    let file = path.join(__dirname,'logs',config.auth_last_file);

    if(!fs.existsSync(dir)) fs.mkdirSync(dir);
    if(!fs.existsSync(file)) fs.writeFileSync(file,'0');

    let last_log = Number(fs.readFileSync(file).toString());
    let previous = last_log+config.auth_validity;
    let time_now = Math.floor(Date.now()/1000);

    if(time_now > (last_log+config.auth_validity)) { return false; } else { return true; }
}

/**
 * Makes login request to appnexus console, saves session cookie, and logs 
 * UNIX time on success with callback trigger if provided as parameter.
 *
 * @param  {Function} callback - Callback function to execute.
 * @return {Null}
 */
function login(callback) {
    let dt = fs.readFileSync(config.auth_file).toString();
    let dc = crypto.createDecipher('aes-256-ctr',config.auth_key);
    let tx = dc.update(dt,'hex','utf8'); tx += dc.final('utf8');

    function writeCookie(data) {
        let cookies_array = [];
        for(let i in data) {let val = data[i].split(';')[0];cookies_array.push(val);}
        fs.writeFileSync(cookie_file,cookies_array.join('; '));
    }

    request(
        {
            method: "POST",
            url: 'https://console.appnexus.com/index/sign-in',
            form: JSON.parse(tx)
        },
        (error,response,body) => 
        {
            let date = Math.floor(Date.now()/1000);
            let file = path.join(__dirname,'logs',config.auth_last_file);

            if(!error) {
                let success_url = 'https://console.appnexus.com/buyside/advertiser';

                if(response.headers.location == success_url) {
                    writeCookie(response.headers['set-cookie']);
                    fs.writeFileSync(file,date);
                    logEvent('login_access','Ok: Login successful.');
                    if(callback) callback();
                } else {
                    logEvent('login_access','Error: Login failed.');
                }

                // Reference only.
                // fs.writeFileSync('logs/login_header.log',prettyd.json(JSON.stringify(response.headers)));
                // fs.writeFileSync('logs/login_body.log',body);

            } else {
                logEvent('login_access', `Error: ${error.message}`);
            }
        }
    );
}

/**
 * Ensures session to appnexus service is maintained.
 * 
 * @param  {Function} callback - Function to call after session is kept.
 * @return {Null}
 */
function keepAlive(callback) {
    if(!isLogged()) {
        if(login_attempts < 3) {
            login_attempts++;
            logEvent('login_access','NOTICE: Previous session has expired.');
            logEvent('login_access','Login attempt '+login_attempts);
            login(callback);
        } else {
            logEvent('login_access','ERROR: Login failed permanently with attempts '+login_attempts);
        }
    } else {
        callback();
    }
}

/**
 * Makes get call to appnexus along with session cookies to retreive CSV file
 * and write contents to a file. 
 * 
 * @param  {Object}   country   - Country object with 'name' and 'code'
 *                                properties.
 * @param  {Number}   device_id - Appnexus' numeric value for device type.
 * @param  {Number}   supply_id - Appnexus' numeric value for supply type.
 * @param  {String}   filename  - Name of CSV file to save as combination of 
 *                                supply and device names, ie 'all.web'.
 * @param  {Function} callback  - Callback after task is done.
 * @return {Null}
 */
function downloadCSV(country,device_id,supply_id,callback) {

    let filename = device_names[device_id]+'.'+supply_names[supply_id]+'.csv';
    let filters  = {"search": "", "report_type": "seller" };

    if(country.name != "any") filters.country = country.name;
    if(device_id != "any") filters.device_type = [device_id];
    if(supply_id != "any") filters.supply_type = [supply_id];
        
    let download_url = 'https://console.appnexus.com/inventory-research/export-report?filters='+
                        JSON.stringify(filters);
    // Report status.
    accounted_files++;
    let progress_text = `Downloading CSV: ${accounted_files} of ${total_files}`;
    process.stdout.clearLine();
    process.stdout.cursorTo(0);
    process.stdout.write(progress_text);

    request(
        {
            method: "GET",
            url: download_url,
            headers: { Cookie: fs.readFileSync(cookie_file).toString() }
        },
        (error,response,body) =>
        {
            let dir  = path.join(__dirname,'csv',country.code);
            let file = path.join(__dirname,'csv',country.code,filename);

            if (!fs.existsSync(dir)) fs.mkdirSync(dir);
            if(error) {
                logEvent('csv_errors',`ERROR: "${error.message}" for file csv/${country.code}/${filename}`);
            } else {
                if(!checkcsv(body)) {
                    logEvent('csv_errors',`Not a valid CSV for file csv/${country.code}/${filename}"`);
                } else {
                    completed_files++;
                }
                fs.writeFileSync(file, body, {encoding:'utf8'});
            }
            if(callback) callback();
        }
    );
}

/**
* Retrieve all 16 CSV files in a country and save to its folder.
* 
* @param  {Object}   country   - Country object with 'name' and 'code'
*                                properties.
* @param  {Function} callback  - Callback function.
*/
function saveCountryData(country,callback) {
    function getInventory(index) {
        keepAlive(()=>{
            let inventory_now = inventory_types[index];
            downloadCSV(country,inventory_now.device_id,inventory_now.supply_id,()=>{
                let next = index + 1;
                if(next < inventory_types.length) {
                    getInventory(next);
                } else {
                    if(callback) callback();
                }
            });
        });
    }
    getInventory(0);
}

function saveAllCountryData(callback) {
    function getCountry(index) {
        saveCountryData(countries[index],()=>{
            let next = index + 1;
            if(next < countries.length) {
                getCountry(next);
            } else {
                if(callback) callback();
            }
        });
    }
    getCountry(0);
}

function scrape() {
    // Empty CSV folder for old files.
    fs.emptyDirSync(path.join(__dirname,'csv'));
    // Start scraping.
    let scrape_last_file = path.join(__dirname,'logs','scrape_last.log');
    fs.writeFileSync(scrape_last_file,date_today);
    logEvent('app_run','CSV scraping started.');
    saveAllCountryData(()=>{
        console.log("");
        console.log(`Total saved files: ${completed_files}`);
        logEvent('app_run',`CSV scraping done. Total files saved: ${completed_files}/${total_files}.`);
        // Save CSV to database.
        exec('node update_db',(error,stdout,stderr)=>{
            console.log(stdout);
        });
    });
}
// Run the scraping app.
scrape();