const checkcsv  = require('detect-csv');
const crypto    = require('crypto');
const exec      = require('child_process').exec;
const fs        = require('fs-extra');
const path      = require('path');
const prettyd   = require("pretty-data").pd;
const request   = require('request');

/* File Dependencies */
const config     = JSON.parse(fs.readFileSync('config.json'));
const input_list = process.argv[2] || 'countries_jvector_map.json';
const countries  = JSON.parse(fs.readFileSync(path.join('json',input_list)));

// Reference
const date_today = (new Date()).toISOString().replace(/T\d{2}.+/,"");
const total_csv = countries.length * 16;
const cookie_file = path.join(__dirname,config.cookie_file);
const auth_last_file = path.join(__dirname,config.auth_last_file);

var login_attempts = 0;
var csv_requested = 0;
var csv_retrieved = 0;
var csv_completed = 0;

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
function isLogged(){
    if(!fs.existsSync('logs')) fs.mkdirSync('logs');
    if(!fs.existsSync(auth_last_file)) fs.writeFileSync(auth_last_file,'0');
    let last_log = Number(fs.readFileSync(auth_last_file).toString());
    let previous = last_log+config.auth_validity;
    let time_now = Math.floor(Date.now()/1000);
    if(time_now > (last_log+config.auth_validity)){
        return false;
    } else { return true; }
}

/**
 * Makes login call to appnexus console, saves session cookie, and logs UNIX
 * time on success with callback trigger if provided as parameter.
 *
 * @param  {Function} callback - Callback function to execute.
 * @return {Null}
 */
function login(callback){
    let dt = fs.readFileSync(config.auth_file).toString();
    let dc = crypto.createDecipher('aes-256-ctr',config.auth_key);
    let tx = dc.update(dt,'hex','utf8'); tx += dc.final('utf8');
    let data = {
        url: 'https://console.appnexus.com/index/sign-in',
        form: JSON.parse(tx)
    };
    function writeCookie(data){
        let cookies_array = [];
        for(let i in data){let val = data[i].split(';')[0];cookies_array.push(val);}
        fs.writeFileSync(cookie_file,cookies_array.join('; '));
    }
    request.post(data,function(error,response,body){
        let date = Math.floor(Date.now()/1000);
        let success = false;
        if(!error){
            if(response.headers.location == 'https://console.appnexus.com/buyside/advertiser') {
                writeCookie(response.headers['set-cookie']);
                fs.writeFileSync(auth_last_file,date);
                logEvent('login_access','Ok: Login successful.');
                success = true;
            }
            else {
                logEvent('login_errors','Error: Login failed.');
            }
            fs.writeFileSync('logs/login_header.log',prettyd.json(JSON.stringify(response.headers)));
            fs.writeFileSync('logs/login_body.log',body);
        }
        else{logEvent('login_errors',error.message);}
        if(success) {
            logEvent('login_access','Ok: Login successful.');
            if(callback) callback();
        } else {
            logEvent('login_access','Error: Login failed.');
        }
    });
}

/**
 * Ensures session to appnexus service is maintained.
 * 
 * @param  {Function} callback - Function to call after session is kept.
 * @return {Null}
 */
function keepAlive(callback) {
    if(!isLogged()){
        if(login_attempts < 3) {
            login_attempts++;
            logEvent('login_access','NOTICE: Previous session has expired.');
            console.log('NOTICE: Previous session has expired.');
            logEvent('login_access','Login attempt '+login_attempts);
            login(callback);
        } else {
            logEvent('login_errors','ERROR: Login failed permanently with attempts '+login_attempts);
        }
            
    } else {
        // console.log('OK: Session is still active.');
        callback();
    }
}

/**
 * Makes get call to appnexus along with session cookies to retreive CSV file. 
 * 
 * @param    {Object} country          - Country object with 'name' and 'code' properties.
 * @param    {Number} device           - Appnexus' numeric value for device type.
 * @param    {Number} supply           - Appnexus' numeric value for supply type.
 * @param    {String} filename         - Name of CSV file to save as combination of supply
 *                                       and device names, ie 'all.web'.
 * @return   {Null}
 */
function getCSV(country,device,supply,filename){
    csv_requested++;
    let filters = {"search": "", "report_type": "seller" };
        if(country.name != "any") filters.country = country.name;
        if(supply != "any") filters.supply_type = [supply];
        if(device != "any") filters.device_type = [device];
        filters = JSON.stringify(filters);
    let data = {
        url: 'https://console.appnexus.com/inventory-research/export-report?filters='+filters,
        headers: { Cookie: fs.readFileSync(cookie_file).toString() }
    }
    request(data,function(error,response,body){
        csv_retrieved++;
        if(!error){
            let dir = path.join('csv',country.code);
            let csv = path.join('csv',country.code,`${filename}.csv`);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir);
            
            if(!checkcsv(body)) {
                logEvent('csv_errors','Can\'t read csv for "'+country.code+'"');
            } else {
                csv_completed++;
                fs.writeFileSync(csv,body,{encoding:'utf8'});
                //fs.writeFileSync('logs/login_body.log',body);
            }
            if(csv_retrieved == total_csv){
                let done_message = `CSV scraping done. Saved items: ${csv_completed}/${total_csv}.`
                logEvent('app_run',done_message);
                console.log(done_message);
                // Save CSV to database.
                // setTimeout(()=>{exec('node update_db',(error,stdout,stderr)=>{console.log(stdout);})},15000);
            }
        }else{ logEvent('csv_errors','ERROR: "'+error.message+'" for geo '+country.name+'('+country.code+')'); }
    });
}

/**
 * Creates 16 combination of device and supply types for a given country and
 * save resulting CSV files to corresponding country code folder.
 *
 * @param   {Object}   country       - Country object with 'name' and 'code'
 *                                     properties.
 * @param   {Number}   country_delay - Delay in miliseconds between CSV requests.
 * @require {Function} getCSV        - Function that pull and save individual
 *                                     CSV entry.
 * @return   {Null}
 */
function save(country,country_delay){
    setTimeout(()=>{
        console.log(`Scraping: ${country.code}`);
        keepAlive(function(){
            let delay = 0;
            let device_ids = ['any','0','2','3'];
            let supply_ids = ['any','0','1','2'];
            let device_names = {
                    'any': 'any',
                    '0'  : 'desktop',
                    '2'  : 'phone',
                    '3'  : 'tablet'
                };
            let supply_names = {
                    'any': 'any',
                    '0'  : 'web',
                    '1'  : 'mobile_web',
                    '2'  : 'mobile_app' 
                };
            if(!country) country = {name:'any',code:'any'}

            for(let device_id of device_ids) {
                for(let supply_id of supply_ids) {
                    let filename = device_names[device_id]+'.'+supply_names[supply_id];
                    setTimeout(() => getCSV(country,device_id,supply_id,filename),delay);
                    delay += 1000;
                }
            }
        });
    },country_delay);
}


/* Start */
country_delay = 0;
keepAlive(()=>{
    // Empty CSV folder for old files.
    fs.emptyDirSync(path.join(__dirname,'csv'));
    let scrape_last_file = path.join(__dirname,'logs','scrape_last.log');
    fs.writeFileSync(scrape_last_file,date_today);
    logEvent('app_run',`CSV scraping started. Total items: ${total_csv}.`);
    for(country of countries){
        save(country,country_delay);
        country_delay += 18000;
    }
});
