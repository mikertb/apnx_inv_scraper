/**
 * Used to insert total number of individual valid CSV lines from the list of files
 * expected to be found in every country's folder (16/folder). List of country is a
 * JSON formatted list that must be found inside 'json/' folder.
 *
 * Usage:
 *
 *     node update_db [country_list.json]
 * 
 */

const fs = require('fs');
const path = require('path');
const MongoClient = require('mongodb').MongoClient;
const csv = require('fast-csv');

/* File Dependencies */
const config    = JSON.parse(fs.readFileSync('config.json'));
const filename  = process.argv[2] || 'countries_jvector_map.json';
const countries = JSON.parse(fs.readFileSync(path.join(__dirname,'json',filename)));
const scrape_last_file = path.join(__dirname,'logs','scrape_last.log');
if(!fs.existsSync(scrape_last_file)) fs.openSync(scrape_last_file, 'w');
const scrape_last = fs.readFileSync(scrape_last_file).toString();

/* Global Record Reference */
var db           = null;
var geo_codes    = [];
var geo_failed   = [];
var scrape_date  = (/\d{4}\-\d{2}\-\d{2}/.test(scrape_last) === true)? new Date(scrape_last) : (new Date()).toISOString().replace(/T.+/,'');
var total_docs   = 0;
var device_ids   = ['any','0','2','3'];
var supply_ids   = ['any','0','1','2'];
var device_names = {'any':'any', '0':'desktop', '2':'phone', '3':'tablet'};
var supply_names = {'any':'any', '0':'web', '1':'mobile_web', '2':'mobile_app'};

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
* Get all valid CSV items in a country.
*
* @param {Array}   list     List of countries as reference.
* @param {Number}  index    Current index for the list.
* @param {Funcion} callback Callback function to pass an array of document
*                           objects.
*/
function getCountryDocs(list,index,callback){
    let new_docs  = []; // Will contain info of all 16 docs combinations.
    let next = index+1;
    let count = 0;

    if(typeof list[index] === 'undefined'){
        callback(list,next,new_docs);
    }else{
        let geo_code   = (list[index].length > 2)? list[index] : list[index].toUpperCase();
        let geo_folder = path.join(__dirname,"csv",geo_code);

        if(fs.existsSync(geo_folder)){
            let csv_files = fs.readdirSync(geo_folder);

            if(csv_files.length > 0){
                readCSV(csv_files,0,()=>callback(list,next,new_docs));
            }else{
                callback(list,next,new_docs);
            }
        }else{
            callback(list,next,new_docs);
        }

        function readCSV(list,index,callback){
            let cname = list[index];
            let cfile = path.join(__dirname,'csv',geo_code,cname);
            if(fs.existsSync(cfile)){
                let input = fs.createReadStream(cfile);
                input.pipe(csv({objectMode:true,headers: true,strictColumnHandling:true}))
                .on('data',(data) => {
                    data.filter = geo_code+'.'+cname.replace('.csv','');
                    data.filtered_imps = Number(data.filtered_imps);
                    data.filtered_uniques = Number(data.filtered_uniques);
                    data.total_imps = Number(data.total_imps);
                    data.total_uniques = Number(data.total_uniques);
                    data.scrape_date = scrape_date;
                    new_docs.push(data);
                })
                .on('end',() => {
                    count++;
                    if(count == list.length){
                        callback();
                    }else{
                        let next = index+1;
                        readCSV(list,next,callback);
                    }
                })
                .on('error',(e)=>{
                    let csv_current = JSON.stringify();
                    let error_string = `Invalid CSV line for ${geo_code} - ${cname}`;
                    logEvent('csv_errors',error_string);
                    console.log(error_string);
                    count++;
                    if(count == list.length){
                        callback();
                    }else{
                        let next = index+1;
                        readCSV(list,next,callback);
                    }
                });
            }else{
                callback();
            }
        }
    }
}

/**
* Save data for single country.
*/
function saveCountryData(list,next,docs){
    if(typeof list === 'undefined'){
        console.log("Geo list is required.");
    }else if(list.length == 0){
        console.log("List is empty.");
    }else if(typeof next === 'undefined'){
        console.log("Index is required.");
    }else{
        if(typeof docs === 'undefined'){
            if(next < list.length){
                console.log(`\t Geo\t | Docs`);
                console.log("\t---------+---------");
                getCountryDocs(list,next,saveCountryData);
            } else {
                console.log("\t---------+---------");
                console.log(`\t Total\t | ${total_docs}`);
                logEvent('app_run',`DB update done. Inserted: ${total_docs}. Failed: `+geo_failed.join(','));
                db.close();
            }
        } else {
            if(next <= list.length){
                // Insert country docs.
                if(docs.length > 0){
                    let bulk = db.collection('inventory').initializeUnorderedBulkOp();
                    for(doc of docs) bulk.insert(doc);
                    bulk.execute()
                    .then(function(result){
                        // Update and log docs count.
                        total_docs += docs.length;
                        console.log(`\t `+list[next-1].toUpperCase(),`\t | ${docs.length}`);
                        // If there's more, continue to next country.
                        if(next < list.length){
                            getCountryDocs(list,next,saveCountryData);
                        } else {
                            console.log("\t---------+---------");
                            console.log(`\t Total\t | ${total_docs}`);
                            logEvent('app_run',`DB update done. Inserted: ${total_docs}. Failed: `+geo_failed.join(','));
                            db.close();
                        }
                    })
                    .catch((e)=>{
                        geo_failed.push(list[next-1].toUpperCase());
                        logEvent('db',e.toString());
                        console.log(e);
                    });
                } else {
                    geo_failed.push(list[next-1].toUpperCase());
                    getCountryDocs(list,next,saveCountryData);
                }
            } else {
                console.log("\t---------+---------");
                console.log(`\t Total\t | ${total_docs}`);
                logEvent('app_run',`DB update done. Inserted: ${total_docs}. Failed: `+geo_failed.join(','));
                db.close();
            } 
        }
    }
}

/**
* Save all data for each country.
*/
function saveAllCountryData(error,database){
    for(country of countries) geo_codes.push(country.code);
    db = database;
    // Update scrape dates.
    let collection = db.collection('scrape_dates');
    collection.count({"date":scrape_date},(error,found)=>{
        if(found > 0){
            let found_msg = `DB operation halted. Scrape date '${scrape_last}' already exist.`;
            logEvent('app_run',found_msg);
            console.log(found_msg);
            db.close();
        } else {
            collection.insert({"date":scrape_date});
            // Log and start inserting inventories.
            logEvent('app_run','DB update started.');
            saveCountryData(geo_codes,0);
        }
    });
}

// Start the program.
MongoClient.connect('mongodb://localhost/apnx', saveAllCountryData);