# apnx_inv_scraper
Appnexus inventory record scraper.

Main files:

1. scrape.js - Pulls inventory data in a form of CSV files for 174 countries each having 16 
combinations of device and supply types totalling 2,784 files. These CSV files are stored
in a folder named 'csv' organized into subfolders of countries.

2. update_db.js - Upsert db record by parsing all CSV files found in each country specified in
a country list JSON file. This country list file must contain an array of objects representing
each country (see file in json/countries_all.json). A list must be found in folder named 'json'.

Usage:

    node update_db.js <list_file_name.json>

If no argument is passed, it will read the file named 'countries_jvector_map.json'.

3. update_db_queue.js - Allows incremental db update by breaking the whole list into smaller 
sequential batches. The sequence should be saved in 'js/update_queue.js' file.

4. server.js - API server.

Utility:

count_total_record.js - Counts total number of valid CSV lines from the list, each representing
a document record for upsert operation.

Usage:

    node count_total_record.js <list_file_name.json>

If no argument is passed, it will read the file named 'countries_jvector_map.json'.