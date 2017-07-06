const express = require('express');
const MongoClient = require('mongodb').MongoClient;
const path = require('path');
const fs = require('fs');
const app = express();

app.get('/info/inventory',function(req,res){
    MongoClient.connect('mongodb://localhost/apnx', search);

    function search(error,db){
        let date_today       = (new Date()).toISOString().replace(/T\d{2}.+/,"");
        let scrape_last_file = path.join(__dirname,'logs','scrape_last.log');
        if(!fs.existsSync(scrape_last_file)) fs.writeFileSync(scrape_last_file, date_today);
        let scrape_last      = fs.readFileSync(scrape_last_file).toString();

        let collection  = db.collection('inventory');
        let geo_country = !req.query.country? 'any' : (req.query.country == 'all'? 'any' : req.query.country);
        let device_type = !req.query.device_type? "any" : req.query.device_type;
        let supply_type = !req.query.supply_type? "any" : req.query.supply_type;
        let keywords = !req.query.keyword? "" : req.query.keyword;
        let sort = !req.query.sort_by? "filtered_imps" : req.query.sort_by;
        let order = !req.query.order_by? -1 : (req.query.order_by == "asc"? 1 : -1);
        let limit = !req.query.limit? 25 : Number(req.query.limit);
        let pages = 0;
        let page  = !req.query.page? 1 : Number(req.query.page);
        let skip  = limit * (page - 1);
        let sorting = {}; sorting[sort] = order;
        let date = !req.query.date? new Date(scrape_last) : (/\d{4}\-\d{2}\-\d{2}/.test(req.query.date)? new Date(req.query.date) : new Date(scrape_last))
        let find = {
            "filter": `${geo_country}.${device_type}.${supply_type}`,
            "scrape_date": date
        };
        if(keywords.length > 0) find.seller_member_name = {$regex: keywords, $options: "i"};
        collection.count(find,(error,data)=>{
            pages = Math.ceil(data / limit);
            collection.find(find).limit(limit).skip(skip).sort(sorting).toArray((error,docs)=>{
                let response = {
                    status: "success",
                    items: docs,
                    page: {
                        current: page,
                        total: pages
                    }
                }
                res.header("Access-Control-Allow-Origin", "*");
                res.json(response);
                db.close();
            });
        });
    }
});

app.listen(8000,function(){
    console.log("Server is running. Listening at port 8000.");
});