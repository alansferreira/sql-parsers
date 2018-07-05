function initializeDB2Module() {
    const sortModel = { ASC: "ASC", DESC: "DESC" };
    const regexes = {
        SINGLE_COMMENT: /--[^\n\r]+[\r\n]/g,
        FULL_COMMENT: /(\/\*([^*]|[\r\n]|(\*+([^*\/]|[\r\n])))*\*+\/)|(\/\/.*)/g,

        DATABASE_START_POINT: /(((CREATE)|(ALTER)) {1,}(DATABASE)|(USE)) {1,}([a-zA-Z0-9]+)/igm,

        CREATE_TABLE_HEADER: {
            REGEX: /(CREATE|ALTER)[ ]{1,}TABLE[ ]{1,}(((\"([^\"]+)\")|\w+)\.)?((\"([^\"]+)\")|\w+)[ ]{0,}\(/ig,
            CAP_INDEX: {
                COMMAND_TYPE: 1,
                SCHEMA_NAME: 3,
                SCHEMA_NAME_WRAPPED: 5,
                TABLE_NAME: 8,
                TABLE_NAME_WRAPPED: 6,
            }
        },
        ALTER_TABLE_HEADER: {
            REGEX: /(ALTER)[ ]{1,}TABLE[ ]{1,}(((\"([^\"]+)\")|\w+)\.)?((\"([^\"]+)\")|\w+)[ ]{0,}/ig,
            CAP_INDEX: {
                COMMAND_TYPE: 1,
                SCHEMA_NAME: 4,
                TABLE_NAME: 7,
            }
        },
        PK: /(PRIMARY[ ]{1,}KEY)[ ]{1,}\(([^\)]+)+\)/ig,
        PK_COL_DEF:{
            REGEX: /, {0,}([^ ,]+)([ ]{1,}(ASC|DESC))?/ig,
            CAP_INDEX: {
                FIELD_NAME: 1,
                SORT_TYPE: 4
            }
        },

        FOREIGN_KEY: {
            REGEX: /FOREIGN[ ]{1,}KEY[ ]{0,}\(([^\)]+)\)[ ]{1,}REFERENCES[ ]{1,}(((\"([^\"]+)\")|\w+)\.)?((\"([^\"]+)\")|\w+)([ ]{0,}\(([^\)]+)\))?([ ]{0,}ON[ ]{1,}(DELETE|UPDATE)[ ]{1,}((NO[ ]{1,}ACTION)?(SET[ ]{1,}NULL)?|\w+))/ig,
            CAP_INDEX: {
                //CONSTR_NAME: 1,
                COLUMNS: 1,
                REF_TABLE_SCHEMA: 5,
                REF_TABLE_NAME: 8,
                REF_COLUMNS: 10,
                
                DELETE_ACT_TYPE: 13,
                UPDATE_ACT_TYPE: 15,
            }
        },

        TABLE_COLUMN: {
            //REGEX: /[\(,]?[ ]{0,}(\"?([^\"]+))\"?([ ]+(\"?(\w+))\"?[ ]{0,}([ ]{0,}\([ ]{0,}(([0-9]+)([ ]{0,},[ ]{0,}([0-9]+))?)[ ]{0,}\))?)([ ]{1,}(FOR[ ]{1,}[^ ]+[ ]{1,}DATA))?([ ]{1,}(NOT[ ]{1,})?NULL)?([ ]{1,}(WITH[ ]{1,}DEFAULT[ ]{1,})([^ ]+))?([ ]{1,}(GENERATED +BY +DEFAULT +AS +IDENTITY([ ]{0,}\([^\)]+\))))?[ ]{0,}[,]{0,}[ ]{0,}([ ]{1,}(PRIMARY[ ]{1,}KEY([ ]{1,}ASC|[ ]{1,}DESC)))?[,\)] ?/ig,
            REGEX: /((\"([^\"]+)\")|\w+)([ ]+((\"([^\"]+)\")|\w+)([ ]{0,}\([ ]{0,}(([0-9]+)([ ]{0,},[ ]{0,}([0-9]+))?)[ ]{0,}\))?)([^,]+)?/ig,
            CAP_INDEX: {
                NAME_WRAPPED: 3,
                NAME: 1,
                DATA_TYPE: 5,
                PRECISION: 10,
                SCALE: 12,
                //IS_NOT_NULL: 14,
                //IS_PRIMARY: 99,
            }, 
        }, 
        IDENTITY: {
            REGEX: /IDENTITY( +GENERATED +(BY +DEFAULT))?([ ]{0,}\(([ ]{0,}START +WITH +([0-9]+))?([ ]{0,}INCREMENT +BY +([0-9]+))?[^\)]+\))?/ig, 
            CAP_INDEX: {
                SEED: 5,
                STEP: 7,
            }, 
            
        }

    };


    function Column(initialData) {
        this.name = "";
        this.isPrimary = false;
        this.table = null; //new Table();
        this.type = "";
        this.precision = 0;
        this.scale = 0;
        this.isNullable = true;
        this.isAutoIncrement = false;
        this.increment = { seed: 0, step: 1 };

        Object.deepExtend(this, initialData || {});

        this.name = clearSysname(this.name);
    };

    function Table(initialData) {
        this.name = "";
        this.schema = "";
        this.database = null;//new Database();
        this.columns = []; //[new Column()]
        this.indexes = []; //[new IndexContraint()]
        this.foreignKeys = []; //[new ForegnKeyContraint()]

        Object.deepExtend(this, initialData || {});

        this.name = clearSysname(this.name);

    };

    function PrimaryKey(initialData) {
        this.name = "";
        this.columns = []; //[new ColumnIndexSpec()]
        Object.deepExtend(this, initialData || {});

        this.name = clearSysname(this.name);

    };

    function ColumnReferenceSpec(initialData){
        this.name = "";
        this.targetName = "";
        Object.deepExtend(this, initialData || {});

        this.name = clearSysname(this.name);
        this.targetName = clearSysname(this.targetName);

    }
    function ForeignKey(initialData) {
        this.name = "";
        this.columns = []; //[new ColumnReferenceSpec()]
        
        this.targetSchema  = "";
        this.targetTable   = "";
        this.targetColumns= [];
        this.deleteActionType= "";
        this.updateActionType= "";
        
        Object.deepExtend(this, initialData || {});

        this.name = clearSysname(this.name);

    };

    const SORT_TYPE = { ASC: "ASC", DESC: "DESC" };

    function ColumnIndexSpec(initialData) {
        this.name = "";
        this.sort = SORT_TYPE.ASC;

        Object.deepExtend(this, initialData || {});

        this.name = clearSysname(this.name);
    };

    function parseTableScript(scriptData){
        var tables = [];
        var script = scriptData.toString();
        var offset = 0;

        script = clearCommentsAndLines(script);

        iterateRegex(regexes.CREATE_TABLE_HEADER.REGEX, script, function (regexp, inputText, match) {
            var tableScript = script.substring(match.index + match[0].length, script.indexOfCloser(match.index + match[0].length, "(", ")") + 1);
            var tableConstraints = [];

            var tableSchema = match[regexes.CREATE_TABLE_HEADER.CAP_INDEX.SCHEMA_NAME] || match[regexes.CREATE_TABLE_HEADER.CAP_INDEX.SCHEMA_NAME_WRAPPED];
            var tableName = match[regexes.CREATE_TABLE_HEADER.CAP_INDEX.TABLE_NAME] || match[regexes.CREATE_TABLE_HEADER.CAP_INDEX.TABLE_NAME_WRAPPED];
            
            var table = tables.filter((t) => { return t.name == tableName && t.schema == tableSchema; })[0];
            
            if(!table){
                table = new Table({
                    src: tableScript,
                    schema: tableSchema,
                    name: tableName
                });

                tables.push(table);
            }

            //TABLE CONSTRAINTS
            //iterateRegex(regexes.CONSTRAINT_INLINE, tableScript, function (regexp, inputText, match) {
            //    tableConstraints.push(match);

            //    tableScript = tableScript.substring(0, match.index) + tableScript.substring(match.index + match[0].length);
            //});

            table.columns = parseColumnScript(tableScript);

            table.primaryKey = parsePrimaryKey(tableScript);

            table.primaryKey.columns.map((pkc) => {
                var c = table.columns.filter((c) => {return c.name==pkc.name;})[0];
                if(!c) return true;
                c.isPrimary = true;
            });        

            table.foreignKeys = parseForeignKeys(tableScript);

            for (var c in table.columns) {
                c.table = table;
            }

        });

        return tables;
    };
    function parseColumnScript(scriptColumns){
        var columns = [];
        var script = scriptColumns.toString();

        script = clearCommentsAndLines(script);
        
        iterateRegex(regexes.TABLE_COLUMN.REGEX, script, function (regexp, inputText, match) {
            if( regexes.FOREIGN_KEY.REGEX.test(match.input)) return true;

            var columnSpec = match[0];
            var currentColumn = new Column({
                name: match[regexes.TABLE_COLUMN.CAP_INDEX.NAME_WRAPPED] || match[regexes.TABLE_COLUMN.CAP_INDEX.NAME],
                type: match[regexes.TABLE_COLUMN.CAP_INDEX.DATA_TYPE],
                precision: match[regexes.TABLE_COLUMN.CAP_INDEX.PRECISION],
                scale: match[regexes.TABLE_COLUMN.CAP_INDEX.SCALE],
                // isPrimary: !!match[regexes.TABLE_COLUMN.CAP_INDEX.IS_PRIMARY],
                // isAutoIncrement: !!match[regexes.TABLE_COLUMN.CAP_INDEX.IS_IDENTITY],
                // increment: {
                //     seed: match[regexes.TABLE_COLUMN.CAP_INDEX.IDENTITY_SEED],
                //     step: match[regexes.TABLE_COLUMN.CAP_INDEX.IDENTITY_STEP]
                // },
                // isNullable: !match[regexes.TABLE_COLUMN.CAP_INDEX.IS_NOT_NULL],

                src: columnSpec
            });

            // PARSE IDENTITY, NULLABLE... STUFF HERE!!

            var mIdentity = regexes.IDENTITY.REGEX.exec(match[0]);
            if(mIdentity){
                currentColumn.isAutoIncrement = true;
                currentColumn.increment = {
                    seed: mIdentity[regexes.IDENTITY.CAP_INDEX.SEED] || 0,
                    step: mIdentity[regexes.IDENTITY.CAP_INDEX.STEP] || 1
                };
            }else{
                delete currentColumn.increment;
            }


            columns.push(currentColumn);

        });

        return columns;
    };

    function parsePrimaryKey(script){
        var primaryKey = new PrimaryKey({});
        var script = script.toString();
        script = clearCommentsAndLines(script);

        iterateRegex(regexes.PK, script, function (regexp, inputText, match) {
            iterateRegex(regexes.PK_COL_DEF.REGEX, ', ' + match[2], function (regexp1, inputText1, match1) {
                primaryKey.columns.push(new ColumnIndexSpec({
                    name: match1[regexes.PK_COL_DEF.CAP_INDEX.FIELD_NAME], 
                    sort: match1[regexes.PK_COL_DEF.CAP_INDEX.SORT_TYPE] || SORT_TYPE.ASC
                }));
            });
        });

        return primaryKey;
    };


    function parseForeignKeys(script){
        var expr = regexes.FOREIGN_KEY.REGEX;
        var captures = regexes.FOREIGN_KEY.CAP_INDEX;
        var foreignKeys = [];
        var script = script.toString();
        script = clearCommentsAndLines(script);

        iterateRegex(expr, script, function (regexp, inputText, match) {
            var foreignKey = new ForeignKey({
                //name: match[captures.CONSTR_NAME], 
                columns: match[captures.COLUMNS].split(','), 
                targetSchema: match[captures.REF_TABLE_SCHEMA],
                targetTable: match[captures.REF_TABLE_NAME],
                targetColumns: (match[captures.REF_COLUMNS] || match[captures.COLUMNS]).split(","),
                deleteActionType: match[captures.DELETE_ACT_TYPE],
                updateActionType: match[captures.UPDATE_ACT_TYPE],
                mapReference: {}
            });

            var l1 = foreignKey.columns.length;
            var l2 = foreignKey.targetColumns.length;

            var isColumnsLengthEquals = l1==l2;
            if(!isColumnsLengthEquals) {
                
                console.error(`Foreign Key '${foreignKey.name}' reference columns no match!`);
            }
            for (var c = 0; c < (l1>l2?l1:l2); c++) {
                var columnName = clearSysname(foreignKey.columns[c]);
                var targetColumnName = clearSysname(foreignKey.targetColumns[c]);

                foreignKey.mapReference[columnName] = targetColumnName;
            }

            foreignKeys.push(foreignKey);
        });

        return foreignKeys;
    };

    function parseDatabaseScript(scriptData){

    }


    function iterateRegex(regexp, inputText, callback) {
        var matches = [];
        
        while ((m = regexp.exec(inputText)) !== null) {
            // This is necessary to avoid infinite loops with zero-width matches
            if (m.index === regexp.lastIndex) {
                regexp.lastIndex++;
            }
            
            callback(regexp, inputText, m);
        }    

    };
    function clearCommentsAndLines(content){
        var contentAux = content.replace(regexes.SINGLE_COMMENT, "");
        
        contentAux = contentAux.replace(/\t/g, " ").replace(/\r/g, " ").replace(/\n/g, " ");

        while (regexes.FULL_COMMENT.test(contentAux)) {
            contentAux = contentAux.replace(regexes.FULL_COMMENT, "");
        }

        return contentAux;
    }
    function clearSysname(argName) {
        var sysname = argName;

        if (sysname.startsWith('"')) sysname = sysname.substring(1);
        if (sysname.endsWith('"')) sysname = sysname.substring(0, sysname.length - 1);

        return sysname;
    };

    /// <summary>the @param start should be after from opener</summary>
    String.prototype.indexOfCloser = function findClosesOf(start, opener, closer) {
        var countOpener = 1;
        for (var i = start; i < this.length; i++) {
            if (this[i] == opener) { countOpener++; continue; }
            if (this[i] == closer) {
                countOpener--;
                if (countOpener == 0) {
                    return i;
                }
                continue;
            }

        }
    };

    Object.deepExtend = function (destination, source) {
        for (var property in source) {
            if (source[property] && source[property].constructor &&
                source[property].constructor === Object) {
                destination[property] = destination[property] || {};
                arguments.callee(destination[property], source[property]);
            } else {
                destination[property] = source[property];
            }
        }
        return destination;
    };

    var db2_module = {
        parseTable: parseTableScript, 
        parseColumn: parseColumnScript, 
        Table: Table, 
        Column: Column,
        ColumnIndexSpec: ColumnIndexSpec, 
        ColumnReferenceSpec: ColumnReferenceSpec, 
        ForeignKey: ForeignKey
        
    };
    
   return db2_module;
};

if(typeof module !== "undefined") {
    module.exports = initializeDB2Module();
}
