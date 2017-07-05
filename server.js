const express = require('express');
const MongoClient = require('mongodb').MongoClient;
const app = express();

app.get('/info/inventory',function(req,res){
    MongoClient.connect('mongodb://localhost/apnx', search);
    function search(error,db){
        let collection  = db.collection('inventory');
        let geo_country = !req.query.country? 'any' : (req.query.country == 'all'? 'any' : req.query.country);
        let device_type = !req.query.device_type? "any" : req.query.device_type;
        let supply_type = !req.query.supply_type? "any" : req.query.supply_type;
        let keywords = !req.query.keyword? "" : req.query.keyword;
        let find = {"filter": `${geo_country}.${device_type}.${supply_type}`};
        if(keywords.length > 0) find.seller_member_name = {$regex: keywords, $options: "i"};
        let sort = !req.query.sort_by? "filtered_imps" : req.query.sort_by;
        let order = !req.query.order_by? -1 : (req.query.order_by == "asc"? 1 : -1);
        let limit = !req.query.limit? 25 : Number(req.query.limit);
        let pages = 0;
        let page  = !req.query.page? 1 : Number(req.query.page);
        let skip  = limit * (page - 1);
        let sorting = {};
        sorting[sort] = order;

        collection.find(find).count((error,data)=>{
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
            // res.send("records: "+data);
            // db.close();
        });
    }
    // console.log(req.query.country);
    // res.json(req.params);
});

app.listen(8000,function(){
    console.log("Server is running. Listening at port 8000.");
});