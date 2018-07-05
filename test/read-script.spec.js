var assert = require('assert');
var sqlParsers = require('../src');
var fs = require('fs');

describe('Read and parse table scripts', function(){

    it('should parse 13 DB2 tables', function(){
        var script = new String(fs.readFileSync('./test/db2.full-script.sql'));
        
        var tables = sqlParsers.db2.parseTable(script);
        
        assert(tables.length==13, 'error');
    });


    it('should parse 4 MSSQL tables', function(){
        var script = new String(fs.readFileSync('./test/mssql.full-script.sql'));
        
        var tables = sqlParsers.mssql.parseTable(script);
        assert(tables.length==4, 'error');
    });

});



// fs.readFile('scripts/db2.column.identity.test.sql', function(err, data){
//     var script = new String(data).toString();
//     var tables = cdsParser.parseColumn(script);
//     console.log(tables);
// });


