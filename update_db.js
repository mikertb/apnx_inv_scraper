/**
 * Used to upsert total number of individual valid CSV lines from the list of files
 * expected to be found in every country's folder (16/folder). List of country is a
 * JSON formatted list that must be found inside 'json/' folder.
 *
 * Usage:
 *
 *     node update_db.js [country_list.json]
 * 
 */

const fs = require('fs');
const MongoClient = require('mongodb').MongoClient;
const csv = require('fast-csv');

/* File Dependencies */
const config    = JSON.parse(fs.readFileSync('config.json'));
const filename  = process.argv[2] || 'countries_jvector_map.json';
const countries = JSON.parse(fs.readFileSync('json/'+filename));

/**
 * Makes a single log entry in logs folder.
 * 
 * @param  {String} type    Name of logfile.
 * @param  {String} message Message of a log.
 * @return {Null}
 */
function logger(type,message){
    let date = (new Date()).toISOString().replace(/T/, ' ').replace(/\..+/, '')+' UTC';
    let full_text = date+' - '+message+"\n";
    if(!fs.existsSync('logs')) fs.mkdirSync('logs');
    fs.writeFileSync('logs/'+type+'.log',full_text,{flag:'a'});
 }

/**
 * Builds an array of operations for each CSV line entry from list of countries and use
 * that one array for bulk write operation.
 * 
 * @param  Object error Database error object.
 * @param  Object db    Database connection object.
 * @return Null         NA.
 */
function saveAll(error,db){
    if(!error) {
        logger('app_run','Updating DB from list '+filename+'...');

        var upsert_objects = [];
        var device_ids = ['any','0','2','3'];
        var supply_ids = ['any','0','1','2'];
        var device_names = {'any':'any', '0':'desktop', '2':'phone', '3':'tablet'};
        var supply_names = {'any':'any', '0':'web', '1':'mobile_web', '2':'mobile_app'};
        var files_total = 0;
        var files_done  = 0;

        // Count total number of files.
        for(let country of countries){
            let files = fs.readdirSync('csv/'+country.code);
            files_total += files.length;
        }

        // Upsert loop.
        for(let country of countries){
            for(let device_id of device_ids){
                for(let supply_id of supply_ids){
                    let selector = device_names[device_id]+'-'+supply_names[supply_id];
                    let filename = device_names[device_id]+'.'+supply_names[supply_id];
                    let filepath = 'csv/'+country.code+'/'+filename+'.csv';
                    let temp_data = [];
                    if(fs.existsSync(filepath)){
                        let input = fs.createReadStream(filepath);
                        input.pipe(csv({objectMode:true,headers: true,strictColumnHandling:true}))
                        .on('data',(data) => {
                            data.filtered_imps = Number(data.filtered_imps);
                            data.filtered_uniques = Number(data.filtered_uniques);
                            data.total_imps = Number(data.total_imps);
                            data.total_uniques = Number(data.total_uniques);
                            let selector_obj = { geo_country: data.geo_country, seller_member_id: data.seller_member_id, filter: selector }
                            let update_data = { updateMany: { filter: selector_obj, update: {$set: data}, upsert:true } }
                            upsert_objects.push(update_data);
                        })
                        .on('end',() => {
                            files_done++;
                            if(files_done == files_total){
                                var collection = db.collection('inventory');
                                collection.createIndex({ geo_country: 1, seller_member_id: 1, filter: 1 });
                                collection.bulkWrite(upsert_objects,function(error,r){
                                    if(!error){
                                        logger('app_run','DB update done.');
                                    }else{
                                        logger('app_run','DB update incomplete.');
                                    }
                                    db.close();
                                    console.log("Task completed.");
                                });
                                
                            }
                        });
                    }
                }
            }
        }

    } else { logger('db','ERROR: Database, '+error.message); }
}

// Start the program.
MongoClient.connect('mongodb://localhost/apnx', saveAll);