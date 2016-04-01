//packer version
//LiteScene by javi.agenjo@gmail.com 2013 @tamats
// github.com/jagenjo/litescene
// dependencies: litegl.js glMatrix.js (and litegraph.js)
//Here goes the licence and some info
//************************************************
//and the commonJS header...
'use strict';

(function(global){

/* WBin: Javi Agenjo javi.agenjo@gmail.com  Febrary 2014

WBin allows to pack binary information easily
Works similar to WAD file format from ID Software. You have binary lumps with a given name (and a special type code).
First we store a file header, then info about every lump, then a big binary chunk where all the lumps data is located.
The lump headers contain info to the position of the data in the lump binary chunk (positions are relative to the binary chung starting position)

Header: (64 bytes total)
	* FOURCC: 4 bytes with "WBIN"
	* Version: 4 bytes for Float32, represents WBin version used to store
	* Flags: 2 bytes to store flags (first byte reserved, second is free to use)
	* Num. lumps: 2 bytes number with the total amount of lumps in this wbin
	* ClassName: 32 bytes to store a classname, used to know info about the object stored
	* extra space for future improvements

Lump header: (64 bytes total)
	* start: 4 bytes (Uint32), where the lump start in the binary area
	* length: 4 bytes (Uint32), size of the lump
	* code: 2 bytes to represent data type using code table (Uint8Array, Float32Array, ...)
	* name: 54 bytes name for the lump

Lump binary: all the binary data...

*/

/**
* WBin allows to create binary files easily (similar to WAD format). You can pack lots of resources in one file or extract them.
* @class WBin
*/

function WBin()
{
}

WBin.classes = {};//if the WBin contains a class it will be seaerch here first (otherwise it will search in the global scope)

WBin.HEADER_SIZE = 64; //num bytes per header, some are free to future improvements
WBin.FOUR_CC = "WBIN";
WBin.VERSION = 0.3; //use numbers, never strings, fixed size in binary
WBin.CLASSNAME_SIZE = 32; //32 bytes: stores a type for the object stored inside this binary

WBin.LUMPNAME_SIZE = 54; //max size of a lump name, it is big because sometimes some names have urls
WBin.LUMPHEADER_SIZE = 4+4+2+WBin.LUMPNAME_SIZE; //32 bytes: 4 start, 4 length, 2 code, 54 name

WBin.CODES = {
	"ArrayBuffer":"AB", "Int8Array":"I1", "Uint8Array":"i1", "Int16Array":"I2", "Uint16Array":"i2", "Int32Array":"I4", "Uint32Array":"i4",
	"Float32Array":"F4", "Float64Array": "F8", "Object":"OB","String":"ST","WString":"WS","Number":"NU", "null":"00"
};

WBin.REVERSE_CODES = {};
for(var i in WBin.CODES)
	WBin.REVERSE_CODES[ WBin.CODES[i] ] = i;

WBin.FULL_BINARY = 1; //means this binary should be passed as binary, not as object of chunks

/**
* Allows to check if one Uint8Array contains a WBin file
* @method WBin.isWBin
* @param {UInt8Array} data
* @return {boolean}
*/
WBin.isWBin = function(data)
{
	var fourcc = data.subarray(0,4);
	for(var i = 0; i < fourcc.length; i++)
		if(fourcc[i] != 0 && fourcc[i] != WBin.FOUR_CC.charCodeAt(i))
			return false;
	return true;
}

/**
* Builds a WBin data stream from an object (every property of the object will be considered a lump with data)
* It supports Numbers, Strings and TypedArrays or ArrayBuffer
* @method WBin.create
* @param {Object} origin object containing all the lumps, the key will be used as lump name
* @param {String} origin_class_name [Optional] allows to add a classname to the WBin, this is used to detect which class to instance when extracting it
* @return {Uint8Array} all the bytes
*/
WBin.create = function( origin, origin_class_name )
{
	if(!origin)
		throw("WBin null origin passed");

	var flags = new Uint8Array([0,0]);
	var version = new Uint8Array( new Float32Array( [WBin.VERSION] ).buffer );
	origin_class_name = origin_class_name || "";

	//use class binary creator
	if(origin.toBinary)
	{
		var content = origin.toBinary();
		if(!content)
			return null;

		if(content.constructor == ArrayBuffer)
		{
			flags[0] |= WBin.FULL_BINARY;

			var classname = WBin.getObjectClassName( origin );
			//alloc memory
			var data = new Uint8Array(WBin.HEADER_SIZE + content.length);
			//set fourcc
			data.set(WBin.stringToUint8Array( WBin.FOUR_CC ));
			//set version
			data.set(version, 4);
			//Set flags
			data.set(flags, 8);
			//set classname
			data.set(WBin.stringToUint8Array(classname,WBin.CLASSNAME_SIZE), 14);
			//set data
			data.set(content, WBin.HEADER_SIZE);
			return data;
		}
		else
			origin = content;
	}

	//create 
	var total_size = WBin.HEADER_SIZE;
	var lumps = [];
	var lump_offset = 0;

	//gather lumps
	for(var i in origin)
	{
		var data = origin[i];
		if(data == null)
			continue;

		if(data.constructor === Blob || data.constructor === File)
			throw("Wbin does not allow Blobs or Files as data to store, conver to ArrayBuffer");

		var classname = WBin.getObjectClassName(data);

		var code = WBin.CODES[ classname ];
		if(!code) 
			code = "OB"; //generic

		//class specific actions
		if (code == "NU")
			data = new Float64Array([data]);  //data.toString(); //numbers are stored as strings
		else if(code == "OB")
			data = JSON.stringify(data); //serialize the data

		var data_length = 0;

		//convert all to typed arrays
		if(typeof(data) == "string")
			data = WBin.stringToUint8Array(data);

		//typed array
		if(data.buffer && data.buffer.constructor == ArrayBuffer)
		{
			//clone the data, to avoid problems with shared arrays
			data = new Uint8Array( new Uint8Array( data.buffer, data.buffer.byteOffset, data.buffer.byteLength ) ); 
			data_length = data.byteLength;
		}
		else if(data.constructor == ArrayBuffer) //plain buffer
			data_length = data.byteLength;
		else
			throw("WBin: cannot be anything different to ArrayBuffer");

		var lumpname = i.substring(0,WBin.LUMPNAME_SIZE);
		if(lumpname.length < i.length)
			console.error("Lump name is too long (max is "+WBin.LUMPNAME_SIZE+"), it has been cut down, this could lead to an error in the future");
		lumps.push({code: code, name: lumpname, data: data, start: lump_offset, size: data_length});
		lump_offset += data_length;
		total_size += WBin.LUMPHEADER_SIZE + data_length;
	}

	//construct the final file
	var data = new Uint8Array(total_size);
	//set fourcc
	data.set(WBin.stringToUint8Array( WBin.FOUR_CC ));
	//set version
	data.set(version, 4);
	//set flags
	data.set(flags, 8);	
	//set num lumps
	data.set( new Uint8Array( new Uint16Array([lumps.length]).buffer ), 10);	
	//set origin_class_name
	if(origin_class_name)
		data.set( WBin.stringToUint8Array( origin_class_name, WBin.CLASSNAME_SIZE ), 12);

	var lump_data_start = WBin.HEADER_SIZE + lumps.length * WBin.LUMPHEADER_SIZE;

	//copy lumps to final file
	var nextPos = WBin.HEADER_SIZE;
	for(var j in lumps)
	{
		var lump = lumps[j];
		var buffer = lump.data;

		//create lump header
		var lump_header = new Uint8Array( WBin.LUMPHEADER_SIZE );
		lump_header.set( new Uint8Array( (new Uint32Array([lump.start])).buffer ), 0);
		lump_header.set( new Uint8Array( (new Uint32Array([lump.size])).buffer ), 4);
		lump_header.set( WBin.stringToUint8Array( lump.code, 2), 8);
		lump_header.set( WBin.stringToUint8Array( lump.name, WBin.LUMPNAME_SIZE), 10);

		//copy lump header
		data.set(lump_header,nextPos); 
		nextPos += WBin.LUMPHEADER_SIZE;

		//copy lump data
		var view = new Uint8Array( lump.data );
		data.set(view, lump_data_start + lump.start);
	}

	return data;
}


/**
* Extract the info from a Uint8Array containing WBin info and returns the object with all the lumps.
* If the data contains info about the class to instantiate, the WBin instantiates the class and passes the data to it
* @method WBin.load
* @param {UInt8Array} data_array 
* @param {bool} skip_classname avoid getting the instance of the class specified in classname, and get only the lumps
* @return {*} Could be an Object with all the lumps or an instance to the class specified in the WBin data
*/
WBin.load = function( data_array, skip_classname )
{
	if(!data_array || ( data_array.constructor !== Uint8Array && data_array.constructor !== ArrayBuffer ) )
		throw("WBin data must be ArrayBuffer or Uint8Array");

	//clone to avoid possible memory aligment problems
	data_array = new Uint8Array(data_array);

	var header = WBin.getHeaderInfo(data_array);
	if(!header)
	{
		console.error("Wrong WBin Header");
		return null;
	}

	if(header.version > (new Float32Array([WBin.VERSION])[0]) ) //all this because sometimes there are precission problems
		console.log("ALERT: WBin version is higher that code version");

	var object = null;

	//lump unpacking
	for(var i in header.lumps)
	{
		if(!object) //we do not create the object unless there is a lump
			object = {};

		var lump = header.lumps[i];
		var lump_data = header.lump_data.subarray( lump.start, lump.start + lump.size );

		if(lump.size != lump_data.length )
			throw("WBin: incorrect wbin lump size");

		var lump_final = null;

		var data_class_name = WBin.REVERSE_CODES[ lump.code ];
		if(!data_class_name)
			throw("WBin: Incorrect data code");

		switch(data_class_name)
		{
			case "null": break;
			case "String": lump_final = WBin.Uint8ArrayToString( lump_data ); break;
			case "Number": 
					if(header.version < 0.3) //LEGACY: remove
						lump_final = parseFloat( WBin.Uint8ArrayToString( lump_data ) );
					else
						lump_final = (new Float64Array( lump_data.buffer ))[0];
					break;
			case "Object": lump_final = JSON.parse( WBin.Uint8ArrayToString( lump_data ) ); break;
			case "ArrayBuffer": lump_final = new Uint8Array(lump_data).buffer; break; //clone
			default:
				lump_data = new Uint8Array(lump_data); //clone to avoid problems with bytes alignment
				var ctor = WBin.classes[ data_class_name ] || window[ data_class_name ];
				if(!ctor)
					throw("WBin referenced class not found: " + data_class_name );
				if( (lump_data.length / ctor.BYTES_PER_ELEMENT)%1 != 0)
					throw("WBin: size do not match type");
				lump_final = new ctor(lump_data.buffer);
		}
		object[ lump.name ] = lump_final;
	}

	//check if className exists, if it does use internal class parser
	if(!skip_classname && header.classname)
	{
		var ctor = WBin.classes[ header.classname ] || window[ header.classname ];
		if(ctor && ctor.fromBinary)
			return ctor.fromBinary(object);
		else if(ctor && ctor.prototype.fromBinary)
		{
			var inst = new ctor();
			inst.fromBinary(object);
			return inst;
		}
		else
		{
			object["@classname"] = header.classname;
		}
	}	

	return object;
}


/**
* Extract the header info from an ArrayBuffer (it contains version, and lumps info)
* @method WBin.getHeaderInfo
* @param {UInt8Array} data_array 
* @return {Object} Header
*/
WBin.getHeaderInfo = function(data_array)
{
	//check FOURCC
	var fourcc = data_array.subarray(0,4);
	var good_header = true;
	for(var i = 0; i < fourcc.length; i++)
		if(fourcc[i] != 0 && fourcc[i] != WBin.FOUR_CC.charCodeAt(i))
			return null; //wrong fourcc

	var version = WBin.readFloat32( data_array, 4);
	var flags = new Uint8Array( data_array.subarray(8,10) );
	var numlumps = WBin.readUint16(data_array, 10);
	var classname = WBin.Uint8ArrayToString( data_array.subarray(12,12 + WBin.CLASSNAME_SIZE) );

	var lumps = [];
	for(var i = 0; i < numlumps; ++i)
	{
		var start = WBin.HEADER_SIZE + i * WBin.LUMPHEADER_SIZE;
		var lumpheader = data_array.subarray( start, start + WBin.LUMPHEADER_SIZE );
		var lump = {};
		lump.start = WBin.readUint32(lumpheader,0);
		lump.size  = WBin.readUint32(lumpheader,4);
		lump.code  = WBin.Uint8ArrayToString(lumpheader.subarray(8,10));
		lump.name  = WBin.Uint8ArrayToString(lumpheader.subarray(10));
		lumps.push(lump);
	}

	var lump_data = data_array.subarray( WBin.HEADER_SIZE + numlumps * WBin.LUMPHEADER_SIZE );

	return {
		version: version,
		flags: flags,
		classname: classname,
		numlumps: numlumps,
		lumps: lumps,
		lump_data: lump_data
	};
}

WBin.getObjectClassName = function(obj) {
    if (obj && obj.constructor && obj.constructor.toString) {
        var arr = obj.constructor.toString().match(
            /function\s*(\w+)/);
        if (arr && arr.length == 2) {
            return arr[1];
        }
    }
    return undefined;
}

WBin.stringToUint8Array = function(str, fixed_length)
{
	var r = new Uint8Array( fixed_length ? fixed_length : str.length);
	var warning = false;
	for(var i = 0; i < str.length; i++)
	{
		var c = str.charCodeAt(i);
		if(c > 255)
			warning = true;
		r[i] = c;
	}

	if(warning)
		console.warn("WBin: there are characters in the string that cannot be encoded in 1 byte.");
	return r;
}

WBin.Uint8ArrayToString = function(typed_array, same_size)
{
	var r = "";
	for(var i = 0; i < typed_array.length; i++)
		if (typed_array[i] == 0 && !same_size)
			break;
		else
			r += String.fromCharCode( typed_array[i] );
	//return String.fromCharCode.apply(null,typed_array)
	return r;
}

//I could use DataView but I prefeer my own version
WBin.readUint16 = function(buffer, pos)
{
	var f = new Uint16Array(1);
	var view = new Uint8Array(f.buffer);
	view.set( buffer.subarray(pos,pos+2) );
	return f[0];
}

WBin.readUint32 = function(buffer, pos)
{
	var f = new Uint32Array(1);
	var view = new Uint8Array(f.buffer);
	view.set( buffer.subarray(pos,pos+4) );
	return f[0];
}

WBin.readFloat32 = function(buffer, pos)
{
	var f = new Float32Array(1);
	var view = new Uint8Array(f.buffer);
	view.set( buffer.subarray(pos,pos+4) );
	return f[0];
}

/* CANNOT BE DONE, XMLHTTPREQUEST DO NOT ALLOW TO READ PROGRESSIVE BINARY DATA (yet)
//ACCORDING TO THIS SOURCE: http://chimera.labs.oreilly.com/books/1230000000545/ch15.html#XHR_STREAMING

WBin.progressiveLoad = function(url, on_header, on_lump, on_complete, on_error)
{
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);

    //get binary format
	xhr.responseType = "arraybuffer";
  	xhr.overrideMimeType( "application/octet-stream" );

    //get data as it arrives
	xhr.onprogress = function(evt)
    {
		console.log(this.response); //this is null till the last packet
		if (!evt.lengthComputable) return;
		var percentComplete = Math.round(evt.loaded * 100 / evt.total);
		//on_progress( percentComplete );
    }

    xhr.onload = function(load)
	{
		var response = this.response;
		if(on_complete)
			on_complete.call(this, response);
	};
    xhr.onerror = function(err) {
    	console.error(err);
		if(on_error)
			on_error(err);
	}
	//start downloading
    xhr.send();
}
*/

//WBin is not registered in LS here, because WBin is included before LS
//IT is done from LS
// ******* LScript  **************************

/**
* LScript allows to compile code during execution time having a clean context
* @class LScript
* @constructor
*/

function LScript()
{
	this.code = "function update(dt) {\n\n}";
	this.exported_callbacks = []; //detects if there is a function with this name and exports it as a property
	this.extracode = "";
	this.extra_methods = null; //add object with methods here to attach methods
}

LScript.onerror = null; //global used to catch errors in scripts

LScript.catch_exceptions = false;
LScript.show_errors_in_console = true;

LScript.prototype.compile = function( arg_vars, save_context_vars )
{
	var argv_names = [];
	var argv_values = [];
	if(arg_vars)
	{
		for(var i in arg_vars)
		{
			argv_names.push(i);
			argv_values.push( arg_vars[i]);
		}
	}
	argv_names = argv_names.join(",");

	var code = this.code;
	code = LScript.expandCode( code );

	var extra_code = "";
	for(var i in this.exported_callbacks)
	{
		var callback_name = this.exported_callbacks[i];
		extra_code += "	if(typeof("+callback_name+") != 'undefined' && "+callback_name+" != window[\""+callback_name+"\"] ) this."+callback_name + " = "+callback_name+";\n";
	}
	code += extra_code;
	this._last_executed_code = code;

	var old_context = this._context;
	
	try
	{
		this._class = new Function(argv_names, code);
		var context_function = LScript.applyToConstructor( this._class, argv_values, this.extra_methods ); //bind globals and methods to context
		this._context = new context_function(); //<-- EXECUTION POINT HERE ***************************************
	}
	catch (err)
	{
		this._class = null;
		this._context = null;
		if(LScript.show_errors_in_console)
		{
			var error_line = LScript.computeLineFromError(err);
			console.error("Error in script\n" + err);
			if( console.groupCollapsed )
			{
				console.groupCollapsed("Error line: " + error_line + " Watch code");
				LScript.showCodeInConsole( this._last_executed_code, error_line );
				console.groupEnd();
			}
			else
				console.error("Error line: " + error_line);
		}
		if(this.onerror)
			this.onerror(err, this._last_executed_code);
		if(LScript.onerror)
			LScript.onerror(err, this._last_executed_code, this);
		return false;
	}


	if(save_context_vars && old_context)
	{
		for(var i in old_context)
			if( this._context[i] !== undefined && old_context[i] && old_context[i].constructor !== Function && (!this._context[i] || this._context[i].constructor !== Function) )
				this._context[i] = old_context[i];
	}

	return true;
}

LScript.prototype.hasMethod = function(name)
{
	if(!this._context || !this._context[name] || typeof(this._context[name]) != "function") 
		return false;
	return true;
}

//argv must be an array with parameters, unless skip_expand is true
LScript.prototype.callMethod = function(name, argv, expand_parameters)
{
	if(!this._context || !this._context[name]) 
		return;

	if(!LScript.catch_exceptions)
	{
		if(argv && argv.constructor === Array && expand_parameters)
			return this._context[name].apply(this._context, argv);
		return this._context[name].call(this._context, argv);
	}

	try
	{
		if(argv && argv.constructor === Array && expand_parameters)
			return this._context[name].apply(this._context, argv);
		return this._context[name].call(this._context, argv);
	}
	catch(err)
	{
		var error_line = LScript.computeLineFromError(err);
		console.error("Error in function\n" + err);
		if( console.groupCollapsed )
		{
			console.groupCollapsed("Error line: " + error_line + " Watch code");
			LScript.showCodeInConsole( this._last_executed_code, error_line );
			console.groupEnd();
		}
		else
			console.error("Error line: " + error_line);
		if(this.onerror)
			this.onerror(err);
		//throw new Error( err.stack ); //TEST THIS
	}
}

//Given a constructor, it attaches several global arguments and methods (from kybernetikos in stackoverflow)
LScript.applyToConstructor = function(constructor, argArray, methods) {
    var args = [null].concat(argArray);
	if(methods)
		for(var i in methods)
			Object.defineProperty( constructor.prototype, i, { value: methods[i], enumerable: true });
    var factoryFunction = constructor.bind.apply(constructor, args);
    return factoryFunction;
}

LScript.showCodeInConsole = function( code, error_line)
{
	if(!code)
		return;
	var lines = code.split("\n");
	var gutter_style = "display: inline-block; width: 40px; background-color:#999; color: white;";
	for(var i = 0; i < lines.length; i++ )
		if(i == error_line)
			console.log("%c "+i+". " + lines[i], "background-color: #A33; color: #FAA;" );
		else
			console.log("%c "+i+". ", gutter_style, lines[i] );
}

//remove comments and trims empty lines
LScript.cleanCode = function(code)
{
	if(!code)
		return "";

	var rx = /(\/\*([^*]|[\r\n]|(\*+([^*\/]|[\r\n])))*\*+\/)|(\/\/.*)/g;
	var code = code.replace( rx ,"");
	var lines = code.split("\n");
	var result = [];
	for(var i = 0; i < lines.length; ++i)
	{
		var line = lines[i]; 
		var pos = line.indexOf("//");
		if(pos != -1)
			line = lines[i].substr(0,pos);
		line = line.trim();
		if(line.length)
			result.push(line);
	}
	return result.join("\n");
}

LScript.expandCode = function(code)
{
	if(!code)
		return "";

	//allow support to multiline strings
	if( code.indexOf("'''") != -1 )
	{
		var lines = code.split("'''");
		code = "";
		for(var i = 0; i < lines.length; i++)
		{
			if(i % 2 == 0)
			{
				code += lines[i];
				continue;
			}

			code += '"' + lines[i].split("\n").join("\\n\\\n") + '"';
		}
	}

	/* using regex, not working
	if( code.indexOf("'''") != -1 )
	{
		var exp = new RegExp("\'\'\'(.|\n)*\'\'\'", "mg");
		code = code.replace( exp, addSlashes );
	}

	function addSlashes(a){ 
		var str = a.split("\n").join("\\n\\\n");
		return '"' + str.substr(3, str.length - 6 ) + '"'; //remove '''
	}
	*/

	return code;
}

LScript.computeLineFromError = function( err )
{
	if(err.lineNumber !== undefined)
	{
		return err.lineNumber;
	}
	else if(err.stack)
	{
		var lines = err.stack.split("\n");
		var line = lines[1].trim();
		if(line.indexOf("(native)") != -1)
			return -1;
		var tokens = line.split(" ");
		var pos = line.lastIndexOf(":");
		var pos2 = line.lastIndexOf(":",pos-1);
		var num = parseInt( line.substr(pos2+1,pos-pos2-1) );
		var ch = parseInt( line.substr(pos+1, line.length - 2 - pos) );
		if(tokens[1] == "Object.CodingModule.eval")
			return -1;
		if (line.indexOf("LScript") != -1 || line.indexOf("<anonymous>") != -1 )
			num -= 3; //ignore the header lines of the LScript class
		return num;
	}
	return -1;
}


global.LScript = LScript;


//Global Scope
var trace = window.console ? console.log.bind(console) : function() {};

//better array conversion to string for serializing
var typed_arrays = [ Uint8Array, Int8Array, Uint16Array, Int16Array, Uint32Array, Int32Array, Float32Array, Float64Array ];
typed_arrays.forEach( function(v) { v.prototype.toJSON = function(){ return Array.prototype.slice.call(this); } } );

/**
* LS is the global scope for the global functions and containers of LiteScene
*
* @class  LS
* @namespace  LS
*/

var LS = {

	//vars used for uuid genereration
	_last_uid: 1,
	_uid_prefix: "@", //WARNING: must be one character long

	Classes: {}, //maps classes name like "Prefab" or "Animation" to its namespace "LS.Prefab". Used in Formats and ResourceManager when reading classnames from JSONs or WBin.

	/**
	* Generates a UUID based in the user-agent, time, random and sequencial number. Used for Nodes and Components.
	* @method generateUId
	* @return {string} uuid
	*/
	generateUId: function ( prefix, suffix ) {
		prefix = prefix || "";
		suffix = suffix || "";
		var str = this._uid_prefix + prefix + (window.navigator.userAgent.hashCode() % 0x1000000).toString(16) + "-"; //user agent
		str += (GL.getTime()|0 % 0x1000000).toString(16) + "-"; //date
		str += Math.floor((1 + Math.random()) * 0x1000000).toString(16) + "-"; //rand
		str += (this._last_uid++).toString(16); //sequence
		str += suffix;
		return str; 
	},

	/**
	* validates name string to ensure there is no forbidden characters
	* valid characters are letters, numbers, spaces, dash, underscore and dot
	* @method validateName
	* @param {string} name
	* @return {boolean} 
	*/
	validateName: function(v)
	{
		var exp = /^[a-z\s0-9-_.]+$/i; //letters digits and dashes
		return v.match(exp);
	},

	_catch_exceptions: false, //used to try/catch all possible callbacks (used mostly during development inside an editor) It is linked to LScript too

	/**
	* Contains all the registered components
	* 
	* @property Components
	* @type {Object}
	* @default {}
	*/
	Components: {},

	/**
	* Register a component (or several) so it is listed when searching for new components to attach
	*
	* @method registerComponent
	* @param {ComponentClass} c component class to register
	*/
	registerComponent: function( c ) { 
		//allows to register several at the same time
		for(var i = 0; i < arguments.length; ++i)
		{
			var component = arguments[i];
			var name = LS.getClassName( component );

			//register
			this.Components[ name ] = component; 
			component.is_component = true;	
			component.resource_type = "Component";

			//Helper: checks for errors
			if( !!component.prototype.onAddedToNode != !!component.prototype.onRemovedFromNode ||
				!!component.prototype.onAddedToScene != !!component.prototype.onRemovedFromScene )
				console.warn("%c Component could have a bug, check events: " + name , "font-size: 2em");

			//add stuff to the class
			if(!component.actions)
				component.actions = {};

			//add default methods
			LS.extendClass( component, LS.Component );
			Component.addExtraMethods( component );

			//event
			LEvent.trigger(LS, "component_registered", component ); 
		}
	},

	/**
	* Tells you if one class is a registered component class
	*
	* @method isClassComponent
	* @param {ComponentClass} comp component class to evaluate
	* @return {boolean} true if the component class is registered
	*/
	isClassComponent: function( comp_class )
	{
		var name = this.getClassName( comp_class );
		return !!this.Components[name];
	},

	/**
	* Is a wrapper for callbacks that throws an LS "code_error" in case something goes wrong (needed to catch the error from the system)
	* @method safeCall
	* @param {function} callback
	* @param {array} params
	* @param {object} instance
	*/
	safeCall: function(callback, params, instance)
	{
		if(!LS.catch_exceptions)
			return callback.apply( instance, params );

		try
		{
			return callback.apply( instance, params );
		}
		catch (err)
		{
			LEvent.trigger(LS,"exception",err);
			//test this
			//throw new Error( err.stack );
			console.error( err.stack );
		}
	},

	/**
	* Is a wrapper for setTimeout that throws an LS "code_error" in case something goes wrong (needed to catch the error from the system)
	* @method setTimeout
	* @param {function} callback
	* @param {number} time in ms
	* @param {number} timer_id
	*/
	setTimeout: function(callback, time)
	{
		if(!LS.catch_exceptions)
			return setTimeout( callback,time );

		try
		{
			return setTimeout( callback,time );
		}
		catch (err)
		{
			LEvent.trigger(LS,"exception",err);
		}
	},

	/**
	* Is a wrapper for setInterval that throws an LS "code_error" in case something goes wrong (needed to catch the error from the system)
	* @method setInterval
	* @param {function} callback
	* @param {number} time in ms
	* @param {number} timer_id
	*/
	setInterval: function(callback, time)
	{
		if(!LS.catch_exceptions)
			return setInterval( callback,time );

		try
		{
			return setInterval( callback,time );
		}
		catch (err)
		{
			LEvent.trigger(LS,"exception",err);
		}
	},

	/**
	* copy the properties (methods and properties) of origin class into target class
	* @method extendClass
	* @param {Class} target
	* @param {Class} origin
	*/
	extendClass: function( target, origin ) {
		for(var i in origin) //copy class properties
		{
			if(target.hasOwnProperty(i))
				continue;
			target[i] = origin[i];
		}

		if(origin.prototype) //copy prototype properties
			for(var i in origin.prototype) //only enumerables
			{
				if(!origin.prototype.hasOwnProperty(i)) 
					continue;

				if(target.prototype.hasOwnProperty(i)) //avoid overwritting existing ones
					continue;

				//copy getters 
				if(origin.prototype.__lookupGetter__(i))
					target.prototype.__defineGetter__(i, origin.prototype.__lookupGetter__(i));
				else 
					target.prototype[i] = origin.prototype[i];

				//and setters
				if(origin.prototype.__lookupSetter__(i))
					target.prototype.__defineSetter__(i, origin.prototype.__lookupSetter__(i));
			}
	},

	/**
	* Clones an object (no matter where the object came from)
	* - It skip attributes starting with "_" or "jQuery" or functions
	* - it tryes to see which is the best copy to perform
	* - to the rest it applies JSON.parse( JSON.stringify ( obj ) )
	* - use it carefully
	* @method cloneObject
	* @param {Object} object the object to clone
	* @param {Object} target=null optional, the destination object
	* @return {Object} returns the cloned object
	*/
	cloneObject: function( object, target, recursive, only_existing )
	{
		if(object === undefined)
			return undefined;
		if(object === null)
			return null;
		switch( object.constructor )
		{
			case String:
			case Number:
			case Boolean:
				return object;
		}

		var o = target;
		if(o === undefined || o === null)
		{
			if(object.constructor === Array)
				o = [];
			else
				o = {};
		}

		for(var i in object)
		{
			if(i[0] == "@" || i[0] == "_" || i.substr(0,6) == "jQuery") //skip vars with _ (they are private) or '@' (they are definitions)
				continue;

			if(only_existing && target[i] === undefined)
				continue;

			//if(o.constructor === Array) //not necessary
			//	i = parseInt(i);

			var v = object[i];
			if(v == null)
				o[i] = null;			
			else if ( isFunction(v) ) //&& Object.getOwnPropertyDescriptor(object, i) && Object.getOwnPropertyDescriptor(object, i).get )
				continue;//o[i] = v;
			else if (v.constructor === Number || v.constructor === String || v.constructor === Boolean ) //elemental types
				o[i] = v;
			else if( v.buffer && v.byteLength && v.buffer.constructor === ArrayBuffer ) //typed arrays are ugly when serialized
			{
				if(o[i] && v && only_existing) 
				{
					if(o[i].length == v.length) //typed arrays force to fit in the same container
						o[i].set( v );
				}
				else
					o[i] = new v.constructor(v); //clone typed array
			}
			else if ( v.constructor === Array ) //clone regular array (container and content!)
			{
				if( o[i] && o[i].set && o[i].length >= v.length ) //reuse old container
					o[i].set(v);
				else
					o[i] = JSON.parse( JSON.stringify(v) ); //not safe to use concat or slice(0) because it doesnt clone content, only container
			}
			else //object: 
			{
				if(v.toJSON)
					o[i] = v.toJSON();
				else if(recursive)
					o[i] = LS.cloneObject( v, null, true );
				else if(LS.catch_exceptions)
				{
					try
					{
						//prevent circular recursions //slow but safe
						o[i] = JSON.parse( JSON.stringify(v) );
					}
					catch (err)
					{
						console.error(err);
					}
				}
				else //slow but safe
				{
					if(v.constructor !== Object && LS.Classes[ LS.getObjectClassName(v) ])
						console.warn("Cannot clone internal classes: " + LS.getObjectClassName(v) );
					else
						o[i] = JSON.parse( JSON.stringify(v) );
				}
			}
		}
		return o;
	},

	/**
	* Clears all the uids inside this object and children (it also works with serialized object)
	* @method clearUIds
	* @param {Object} root could be a node or an object from a node serialization
	*/
	clearUIds: function(root)
	{
		if(root.uid)
			delete root.uid;

		var components = root.components;
		if(!components && root.getComponents)
			components = root.getComponents();

		if(!components)
			return;

		if(components)
		{
			for(var i in components)
			{
				var comp = components[i];
				if(comp[1].uid)
					delete comp[1].uid;
				if(comp[1]._uid)
					delete comp[1]._uid;
			}
		}

		var children = root.children;
		if(!children && root.getChildren)
			children = root.getChildren();

		if(!children)
			return;
		for(var i in children)
			LS.clearUIds(children[i]);
	},


	/**
	* Returns an object class name (uses the constructor toString)
	* @method getObjectClassName
	* @param {Object} the object to see the class name
	* @return {String} returns the string with the name
	*/
	getObjectClassName: function(obj)
	{
		if (!obj)
			return;

		if(obj.constructor.fullname) //this is to overwrite the common name "Prefab" for a global name "LS.Prefab"
			return obj.constructor.fullname;

		if(obj.constructor.name)
			return obj.constructor.name;

		var arr = obj.constructor.toString().match(
			/function\s*(\w+)/);

		if (arr && arr.length == 2) {
			return arr[1];
		}
	},

	/**
	* Returns an string with the class name
	* @method getClassName
	* @param {Object} class object
	* @return {String} returns the string with the name
	*/
	getClassName: function(obj)
	{
		if (!obj)
			return;

		//from function info, but not standard
		if(obj.name)
			return obj.name;

		//from sourcecode
		if(obj.toString) {
			var arr = obj.toString().match(
				/function\s*(\w+)/);
			if (arr && arr.length == 2) {
				return arr[1];
			}
		}
	},

	/**
	* Returns the public properties of one object and the type (not the values)
	* @method getObjectProperties
	* @param {Object} object
	* @return {Object} returns object with attribute name and its type
	*/
	//TODO: merge this with the locator stuff
	getObjectProperties: function( object )
	{
		if(object.getProperties)
			return object.getProperties();
		var class_object = object.constructor;
		if(class_object.properties)
			return class_object.properties;

		var o = {};
		for(var i in object)
		{
			//ignore some
			if(i[0] == "_" || i[0] == "@" || i.substr(0,6) == "jQuery") //skip vars with _ (they are private)
				continue;

			if(class_object != Object)
			{
				var hint = class_object["@"+i];
				if(hint && hint.type)
				{
					o[i] = hint.type;
					continue;
				}
			}

			var v = object[i];
			if(v == null)
				o[i] = null;
			else if ( isFunction(v) )//&& Object.getOwnPropertyDescriptor(object, i) && Object.getOwnPropertyDescriptor(object, i).get )
				continue; //o[i] = v;
			else if (  v.constructor === Boolean )
				o[i] = "boolean";
			else if (  v.constructor === Number )
				o[i] = "number";
			else if ( v.constructor === String )
				o[i] = "string";
			else if ( v.buffer && v.buffer.constructor === ArrayBuffer ) //typed array
			{
				if(v.length == 2)
					o[i] = "vec2";
				else if(v.length == 3)
					o[i] = "vec3";
				else if(v.length == 4)
					o[i] = "vec4";
				else if(v.length == 9)
					o[i] = "mat3";
				else if(v.length == 16)
					o[i] = "mat4";
				else
					o[i] = 0;
			}
			else
				o[i] = 0;
		}
		return o;
	},

	//TODO: merge this with the locator stuff
	setObjectProperty: function(obj, name, value)
	{
		if(obj.setProperty)
			return obj.setProperty(name, value);
		obj[ name ] = value; //clone¿?
		if(obj.onPropertyChanged)
			obj.onPropertyChanged( name, value );
	},

	//solution from http://stackoverflow.com/questions/979975/how-to-get-the-value-from-the-url-parameter
	queryString: function () {
	  // This function is anonymous, is executed immediately and 
	  // the return value is assigned to QueryString!
	  var query_string = {};
	  var query = window.location.search.substring(1);
	  var vars = query.split("&");
	  for (var i=0;i<vars.length;i++) {
		var pair = vars[i].split("=");
			// If first entry with this name
		if (typeof query_string[pair[0]] === "undefined") {
		  query_string[pair[0]] = decodeURIComponent(pair[1]);
			// If second entry with this name
		} else if (typeof query_string[pair[0]] === "string") {
		  var arr = [ query_string[pair[0]],decodeURIComponent(pair[1]) ];
		  query_string[pair[0]] = arr;
			// If third or later entry with this name
		} else {
		  query_string[pair[0]].push(decodeURIComponent(pair[1]));
		}
	  } 
		return query_string;
	}(),

	/**
	* Contains all the registered material classes
	* 
	* @property MaterialClasses
	* @type {Object}
	* @default {}
	*/
	MaterialClasses: {},

	/**
	* Register a Material class so it is listed when searching for new materials to attach
	*
	* @method registerMaterialClass
	* @param {ComponentClass} comp component class to register
	*/
	registerMaterialClass: function( material_class )
	{ 
		var class_name = LS.getClassName( material_class );

		//register
		this.MaterialClasses[ class_name ] = material_class;
		this.Classes[ class_name ] = material_class;

		//add extra material methods
		LS.extendClass( material_class, Material );

		//event
		LEvent.trigger( LS, "materialclass_registered", material_class );
		material_class.resource_type = "Material";
		material_class.is_material = true;
	},

	/**
	* Returns the DOM element responsible for the GUI of the app. This is helpful because this GUI will be automatically remove if the app finishes.
	*
	* @method getGUIElement
	* @return {HTMLElement} 
	*/
	getGUIElement: function()
	{
		if( LS._gui_element )
			return LS._gui_element;

		var gui = document.createElement("div");
		gui.className = "litescene-gui";
		gui.style.position = "absolute";
		gui.style.top = "0";
		gui.style.left = "0";
		gl.canvas.parentNode.appendChild( gui );
		
		LS._gui_element = gui;
		return gui;
	},

	/**
	* Returns an script context using the script name (not the node name), usefull to pass data between scripts.
	*
	* @method getScript
	* @param {String} name the name of the script according to the Script component.
	* @return {Object} the context of the script.
	*/
	removeGUIElement: function()
	{
		if( !LS._gui_element )
			return;

		if(LS._gui_element.parentNode)
			LS._gui_element.parentNode.removeChild( LS._gui_element );
		LS._gui_element = null;
		return;
	},

	/**
	* Returns an script context using the script name (not the node name), usefull to pass data between scripts.
	*
	* @method getScript
	* @param {String} name the name of the script according to the Script component.
	* @return {Object} the context of the script.
	*/
	getScript: function( name )
	{
		var script = LS.Script.active_scripts[name];
		if(script)
			return script.context;
		return null;
	},

	convertToString: function( data )
	{
		if(!data)
			return "";
		if(data.constructor === String)
			return data;
		if(data.constructor === Object)
			return JSON.stringify( object.serialize ? object.serialize() : object );
		if(data.constructor === ArrayBuffer)
			data = new Uint8Array(data);
		return String.fromCharCode.apply(null,data);
	}
}

Object.defineProperty( LS, "catch_exceptions", { 
	set: function(v){ this._catch_exceptions = v; LScript.catch_exceptions = v; },
	get: function() { return this._catch_exceptions; },
	enumerable: true
});

//Add some classes
LS.Classes.WBin = LS.WBin = WBin;

//helpful consts
LS.ZERO = vec3.create();
LS.ONE = vec3.fromValues(1,1,1);
LS.TOP = vec3.fromValues(0,1,0);
LS.BOTTOM = vec3.fromValues(0,-1,0);
LS.RIGHT = vec3.fromValues(1,0,0);
LS.LEFT = vec3.fromValues(-1,0,0);
LS.FRONT = vec3.fromValues(0,0,-1);
LS.BACK = vec3.fromValues(0,0,1);
LS.IDENTITY = mat4.create();

/**
* LSQ allows to set or get values easily from the global scene, using short strings as identifiers
*
* @class  LSQ
*/
var LSQ = {
	/**
	* Assigns a value to a property of one node in the scene, just by using a string identifier
	* Example:  LSQ.set("mynode|a_child/MeshRenderer/enabled",false);
	*
	* @method set
	* @param {String} locator the locator string identifying the property
	* @param {*} value value to assign to property
	*/
	set: function( locator, value, root )
	{
		if(!root)
			LS.GlobalScene.setPropertyValue( locator, value );
		else
		{
			if(root.constructor === LS.SceneNode)
			{
				var path = locator.split("/");
				var node = root.findNodeByUId( path[0] );
				if(!node)
					return null;
				return node.setPropertyValueFromPath( path.slice(1), value );
			}
		}

		scene.refresh();
	},

	/**
	* Retrieves the value of a property of one node in the scene, just by using a string identifier
	* Example: var value = LSQ.get("mynode|a_child/MeshRenderer/enabled");
	*
	* @method get
	* @param {String} locator the locator string identifying the property
	* @return {*} value of the property
	*/
	get: function( locator, root )
	{
		var info;
		if(!root)
			info = LS.GlobalScene.getPropertyInfo( locator );
		else
		{
			if(root.constructor === LS.SceneNode)
			{
				var path = locator.split("/");
				var node = root.findNodeByUId( path[0] );
				if(!node)
					return null;
				info = node.getPropertyInfoFromPath( path.slice(1) );
			}
		}
		if(info)
			return info.value;
		return null;
	},

	/**
	* Shortens a locator that uses unique identifiers to a simpler one, but be careful, because it uses names instead of UIDs it could point to the wrong property
	* Example: "@NODE--a40661-1e8a33-1f05e42-56/@COMP--a40661-1e8a34-1209e28-57/size" -> "node|child/Collider/size"
	*
	* @method shortify
	* @param {String} locator the locator string to shortify
	* @return {String} the locator using names instead of UIDs
	*/
	shortify: function( locator )
	{
		if(!locator)
			return;

		var t = locator.split("/");
		var node = null;

		//already short
		if( t[0][0] != LS._uid_prefix )
			return locator;

		node = LS.GlobalScene._nodes_by_uid[ t[0] ];
		if(!node) //node not found
			return locator;

		t[0] = node.getPathName();
		if(t[1])
		{
			if( t[1][0] == LS._uid_prefix )
			{
				var compo = node.getComponentByUId(t[1]);
				if(compo)
					t[1] = LS.getObjectClassName( compo );
			}
		}
		return t.join("/");
	},

	setFromInfo: function( info, value )
	{
		if(!info || !info.target)
			return;
		var target = info.target;
		if( target.setPropertyValue  )
			if( target.setPropertyValue( info.name, value ) === true )
				return target;
		if( target[ info.name ] === undefined )
			return;
		target[ info.name ] = value;	
	},

	getFromInfo: function( info )
	{
		if(!info || !info.target)
			return;
		var target = info.target;
		var varname = info.name;
		var v = undefined;
		if( target.getPropertyValue )
			v = target.getPropertyValue( varname );
		if( v === undefined && target[ varname ] === undefined )
			return null;
		return v !== undefined ? v : target[ varname ];
	}
};

//register classes
if(global.GL)
{
	LS.Classes["Mesh"] = GL.Mesh;
	LS.Classes["Texture"] = GL.Texture;
}


global.LSQ = LSQ;
global.trace = trace;

//blending mode
var Blend = {
	NORMAL: "normal",
	ALPHA: "alpha",
	ADD: "add",
	MULTIPLY: "multiply",
	SCREEN: "screen",
	CUSTOM: "custom"
}

LS.Blend = Blend;

if(typeof(GL) == "undefined")
	throw("LiteSCENE requires to have litegl.js included before litescene.js");

LS.BlendFunctions = {
	"normal": 	[GL.ONE, GL.ZERO],
	"alpha": 	[GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA],	
	"add": 		[GL.SRC_ALPHA, GL.ONE],
	"multiply": [GL.DST_COLOR, GL.ONE_MINUS_SRC_ALPHA],
	"screen": 	[GL.SRC_ALPHA, GL.ONE],
	"custom": 	[GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA]
}

//used to know the state of the application
LS.STOPPED = 0;
LS.RUNNING = 1;
LS.PAUSED = 2;

var Network = {

	default_dataType: "arraybuffer",

	/**
	* A front-end for XMLHttpRequest so it is simpler and more cross-platform
	*
	* @method request
	* @param {Object} request object with the fields for the request: 
    *			dataType: result type {text,xml,json,binary,arraybuffer,image}, data: object with form fields, callbacks supported: {success, error, progress}
	* @return {XMLHttpRequest} the XMLHttpRequest of the petition
	*/
	request: function(request)
	{
		if(typeof(request) === "string")
			throw("LS.Network.request expects object, not string. Use LS.Network.requestText or LS.Network.requestJSON");
		var dataType = request.dataType || this.default_dataType;
		if(dataType == "json") //parse it locally
			dataType = "text";
		else if(dataType == "xml") //parse it locally
			dataType = "text";
		else if (dataType == "binary")
		{
			//request.mimeType = "text/plain; charset=x-user-defined";
			dataType = "arraybuffer";
			request.mimeType = "application/octet-stream";
		}	
		else if(dataType == "image") //special case: images are loaded using regular images request
		{
			var img = new Image();
			img.onload = function() {
				if(request.success)
					request.success.call(this);
			};
			img.onerror = request.error;
			img.src = request.url;
			return img;
		}

		//regular case, use AJAX call
        var xhr = new XMLHttpRequest();
        xhr.open(request.data ? 'POST' : 'GET', request.url, true);
		xhr.withCredentials = true;
        if(dataType)
            xhr.responseType = dataType;
        if (request.mimeType)
            xhr.overrideMimeType( request.mimeType );
        xhr.onload = function(load)
		{
			var response = this.response;
			if(this.status != 200)
			{
				var err = "Error " + this.status;
				if(request.error)
					request.error(err);
				return;
			}

			if(request.dataType == "json") //chrome doesnt support json format
			{
				try
				{
					response = JSON.parse(response);
				}
				catch (err)
				{
					if(request.error)
						request.error(err);
				}
			}
			else if(request.dataType == "xml")
			{
				try
				{
					var xmlparser = new DOMParser();
					response = xmlparser.parseFromString(response,"text/xml");
				}
				catch (err)
				{
					if(request.error)
						request.error(err);
				}
			}

			if(LS.catch_errors)
			{
				try
				{
					if(request.success)
						request.success.call(this, response);
					LEvent.trigger(xhr,"done",response);
				}
				catch (err)
				{
					LEvent.trigger(LS,"code_error",err);
				}
			}
			else
			{
				if(request.success)
					request.success.call(this, response);
				LEvent.trigger(xhr,"done",response);
			}
		};
        xhr.onerror = function(err) {
			if(request.error)
				request.error(err);
			LEvent.trigger(this,"fail", err);
		}

		if( request.progress )
			xhr.addEventListener( "progress", request.progress );

        xhr.send(request.data);

		return xhr;
	},

	/**
	* retrieve a text file from url (you can bind LEvents to done and fail)
	* @method requestText
	* @param {string} url
	* @param {object} params form params
	* @param {function} callback
	*/
	requestText: function(url, data, callback, callback_error)
	{
		if(typeof(data) == "function")
		{
			callback = data;
			data = null;
		}
		return LS.Network.request({url:url, dataType:"text", success: callback, error: callback_error});
	},

	/**
	* retrieve a JSON file from url (you can bind LEvents to done and fail)
	* @method requestJSON
	* @param {string} url
	* @param {object} params form params
	* @param {function} callback
	*/
	requestJSON: function(url, data, callback, callback_error)
	{
		if(typeof(data) == "function")
		{
			callback = data;
			data = null;
		}
		return LS.Network.request({url:url, data:data, dataType:"json", success: callback, error: callback_error });
	},

	/**
	* retrieve a file from url (you can bind LEvents to done and fail)
	* @method requestFile
	* @param {string} url
	* @param {object} params form params
	* @param {function} callback
	*/
	requestFile: function(url, data, callback, callback_error)
	{
		if(typeof(data) == "function")
		{
			callback = data;
			data = null;
		}
		return LS.Network.request({url:url, data:data, success: callback, error: callback_error });
	},

	/**
	* Request script and inserts it in the DOM
	* @method requestScript
	* @param {String} url could be an array with urls to load in order
	* @param {Function} on_complete
	* @param {Function} on_error
	* @param {Function} on_progress (if several files are required, on_progress is called after every file is added to the DOM)
	**/
	requestScript: function(url, on_complete, on_error, on_progress )
	{
		if(typeof(url)=="string")
			url = [url];

		var total = url.length;
		var size = total;
		for(var i in url)
		{
			var script = document.createElement('script');
			script.num = i;
			script.type = 'text/javascript';
			script.src = url[i];
			script.async = false;
			script.onload = function(e) { 
				total--;
				if(total)
				{
					if(on_progress)
						on_progress(this.src, this.num);
				}
				else if(on_complete)
					on_complete();
			};
			if(on_error)
				script.onerror = function(err) { 
					on_error(err, this.src, this.num );
				}
			document.getElementsByTagName('head')[0].appendChild( script );
		}
	},

	requestFont: function( name, url )
	{
		if(!name || !url)
			throw("LS.Network.requestFont: Wrong font name or url");

		var fonts = this._loaded_fonts;
		if(!fonts)
			fonts = this._loaded_fonts = {};

		if(fonts[name] == url)
			return;
		fonts[name] = url;

		var style = document.getElementById("ls_fonts");
		if(!style)
		{
			style = document.createElement("style");
			style.id = "ls_fonts";
			style.setAttribute("type","text/css");
			document.head.appendChild(style);
		}
		var str = "";
		for(var i in fonts)
		{
			var url = fonts[i];
			str += "@font-face {\n" +
					"\tfont-family: \""+i+"\";\n" + 
					"\tsrc: url('"+url+"');\n" + 
			"}\n";
		}
		style.innerHTML = str;
	}

	//NOT TESTED: to load script asyncronously, not finished. similar to require.js
	/*
	requireScript: function(files, on_complete)
	{
		if(typeof(files) == "string")
			files = [files];

		//store for the callback
		var last = files[ files.length - 1];
		if(on_complete)
		{
			if(!ResourcesManager._waiting_callbacks[ last ])
				ResourcesManager._waiting_callbacks[ last ] = [on_complete];
			else
				ResourcesManager._waiting_callbacks[ last ].push(on_complete);
		}
		require_file(files);

		function require_file(files)
		{
			//avoid require twice a file
			var url = files.shift(1); 
			while( ResourcesManager._required_files[url] && url )
				url = files.shift(1);

			ResourcesManager._required_files[url] = true;

			LS.Network.request({
				url: url,
				success: function(response)
				{
					eval(response);
					if( ResourcesManager._waiting_callbacks[ url ] )
						for(var i in ResourcesManager._waiting_callbacks[ url ])
							ResourcesManager._waiting_callbacks[ url ][i]();
					require_file(files);
				}
			});
		}
	},
	_required_files: {},
	_waiting_callbacks: {}
	*/
};

LS.Network = Network;

/**
* This class contains all the info about a resource and it works as a template for any resource class
* Keep in mind that there are many resource classes like Meshes or Textures that dont inherit from this class.
* This class is used mainly to generic file resources like text files (scripts, csvs, etc)
*
* @class Resource
* @constructor
*/

function Resource()
{
	this.filename = null; //name of file without folder or path
	this.fullpath = null; //contains the unique name as is to be used to fetch it by the resources manager
	this.remotepath = null; //the string to fetch this resource in internet (local resources do not have this name)
	this._data = null;
}

Object.defineProperty( Resource.prototype, "data", {
	set: function(v){ 
		this._data = v;
		this._modified = true;
	},
	get: function() { 
		return this._data;
	},
	enumerable: true
});

//makes this resource available 
Resource.prototype.register = function()
{
	LS.ResourcesManager.registerResource( this.fullpath || this.filename, this );
}

Object.defineProperty( Resource.prototype, "uid", { 
	get: function(){ return this.fullpath || this.filename },
	set: function(v){},
	enumerable: true
});

/**
* Returns an object with a representation of the resource internal data
* The order to obtain that object is:
* 0. checks if getDataToStore function in resource
* 1. test for _original_file (File or Blob)
* 2. test for _original_data (ArrayBuffer)
* 3. toBinary() (ArrayBuffer)
* 4. toBlob() (Blob)
* 5. toBase64() (String)
* 6. serialize() (Object in JSON format)
* 7. data property 
* 8. JSON.stringify(...)
*
* @method Resource.getDataToStore
* @param {Object} resource 
* @return {Object} it has two fields: data and encoding
*/
Resource.getDataToStore = function( resource )
{
	var data = null;
	var encoding = "text";
	var extension = "";

	//get the data
	if (resource.getDataToStore) //function
	{
		data = resource.getDataToStore();
		if(data && data.constructor == ArrayBuffer)
			encoding = "binary";
	}
	else if (resource._original_file) //file
	{
		data = resource._original_file;
		if(data && data.constructor !== File && data.constructor !== Blob)
			console.warn("Resource._original_file is not File or Blob");
		encoding = "file";
	}
	else if( resource._original_data ) //file in ArrayBuffer format
	{
		data = resource._original_data;
		if( data && data.constructor === ArrayBuffer )
			encoding = "binary";
	}
	else if(resource.toBinary) //a function to compute the ArrayBuffer format
	{
		data = resource.toBinary();
		encoding = "binary";
		extension = "wbin";
	}
	else if(resource.toBlob) //a blob (Canvas should have this)
	{
		data = resource.toBlob();
		encoding = "file";
	}
	else if(resource.toBase64) //a base64 string
	{
		data = resource.toBase64();
		encoding = "base64";
	}
	else if(resource.serialize) //a json object
	{
		var obj = resource.serialize();
		if(obj.preview_url) //special case...
			delete obj.preview_url;
		data = JSON.stringify( obj );
	}
	else if(resource.data) //regular string data
		data = resource.data;
	else
		data = JSON.stringify( resource );

	if(data.buffer && data.buffer.constructor == ArrayBuffer)
		data = data.buffer; //store the data in the arraybuffer

	return { data:data, encoding: encoding, extension: extension };
}

//used in the coding pad to assign content to generic text files
Resource.prototype.getData = function()
{
	return this._data;
}

Resource.prototype.setData = function( v, skip_modified_flag )
{
	//remove old file
	if( this._original_data )
		this._original_data = null;
	this._data = v;
	if(!skip_modified_flag)
		this._modified = true;
}

Resource.prototype.getDataToStore = function()
{
	var data = this.data || "";
	if(data.constructor === Object )
		data = JSON.stringify( data );
	return data;
}

Resource.prototype.clone = function()
{
	var r = new LS.Resource();
	r._data = this._data;
	return r;
}


Resource.hasPreview = false; //should this resource use a preview image?

LS.Resource = Resource;
/**
* Static class that contains all the resources loaded, parsed and ready to use.
* It also contains the parsers and methods in charge of processing them
*
* @class ResourcesManager
* @constructor
*/

// **** RESOURCES MANANGER *********************************************
// Resources should follow the text structure:
// + id: number, if stored in remote server
// + resource_type: string ("Mesh","Texture",...) or if omitted the classname will be used
// + filename: string (this string will be used to get the filetype)
// + fullpath: the full path to reach the file on the server (folder + filename)
// + preview: img url
// + toBinary: generates a binary version to store on the server
// + serialize: generates an stringifible object to store on the server

// + _original_data: ArrayBuffer with the bytes form the original file
// + _original_file: File with the original file where this res came from

var ResourcesManager = {

	path: "", //url to retrieve resources relative to the index.html
	proxy: "", //url to retrieve resources outside of this host
	ignore_cache: false, //change to true to ignore server cache
	free_data: false, //free all data once it has been uploaded to the VRAM
	keep_files: false, //keep the original files inside the resource (used mostly in the editor)
	allow_base_files: false, //allow to load files that are not in a subfolder

	//some containers
	resources: {}, //filename associated to a resource (texture,meshes,audio,script...)
	meshes: {}, //loadead meshes
	textures: {}, //loadead textures
	materials: {}, //shared materials (indexed by name)
	materials_by_uid: {}, //shared materials (indexed by uid)

	resources_not_found: {}, //resources that will be skipped because they werent found
	resources_being_loaded: {}, //resources waiting to be loaded
	resources_being_processed: {}, //used to avoid loading stuff that is being processes
	resources_renamed_recently: {}, //used to find resources with old names
	num_resources_being_loaded: 0,
	MAX_TEXTURE_SIZE: 4096,

	resource_pre_callbacks: {}, //used to extract resource info from a file ->  "obj":callback
	resource_post_callbacks: {}, //used to post process a resource type -> "Mesh":callback
	resource_once_callbacks: {}, //callback called once

	virtual_file_systems: {}, //protocols associated to urls  "VFS":"../"
	skip_proxy_extensions: ["mp3","wav","ogg"], //this file formats should not be passed through the proxy

	/**
	* Returns a string to append to any url that should use the browser cache (when updating server info)
	*
	* @method getNoCache
	* @param {Boolean} force force to return a nocache string ignoring the default configuration
	* @return {String} a string to attach to a url so the file wont be cached
	*/

	getNoCache: function(force) { return (!this.ignore_cache && !force) ? "" : "nocache=" + getTime() + Math.floor(Math.random() * 1000); },

	/**
	* Resets all the resources cached, so it frees the memory
	*
	* @method reset
	*/
	reset: function()
	{
		this.resources = {};
		this.meshes = {};
		this.textures = {};
	},

	/**
	* Resources need to be parsed once the data has been received, some formats could be parsed using native functions (like images) others 
	* require to pass the data through a series of functions (extract raw content, parse it, upload it to the GPU...
	* Registering a resource preprocessor the data will be converted once it is in memory 
	*
	* @method registerResourcePreProcessor
	* @param {String} fileformats the extension of the formats that this function will parse
	* @param {Function} callback the function to call once the data must be processed, if the process is async it must return true
	* @param {string} data_type 
	* @param {string} resource_type 
	*/
	registerResourcePreProcessor: function( fileformats, callback, data_type, resource_type )
	{
		var ext = fileformats.split(",");
		for(var i in ext)
		{
			var extension = ext[i].toLowerCase();
			this.resource_pre_callbacks[ extension ] = callback;
		}
	},

	/**
	* Some resources require to be post-processed right after being parsed to validate, extend, register (meshes need to have the AABB computed...)
	* This job could be done inside the parser but it is better to do it separatedly so it can be reused among different parsers.
	*
	* @method registerResourcePostProcessor
	* @param {String} resource_type the name of the class of the resource
	* @param {Function} callback the function to call once the data has been processed
	*/
	registerResourcePostProcessor: function(resource_type, callback)
	{
		this.resource_post_callbacks[ resource_type ] = callback;
	},

	/**
	* Returns the filename extension from an url
	*
	* @method getExtension
	* @param {String} url
	* @return {String} filename extension
	*/

	getExtension: function(url)
	{
		var question = url.indexOf("?");
		if(question != -1)
			url = url.substr(0,question);

		var point = url.lastIndexOf(".");
		if(point == -1) return "";
		return url.substr(point+1).toLowerCase();
	},

	/**
	* Returns the filename from a full path
	*
	* @method getFilename
	* @param {String} fullpath
	* @return {String} filename extension
	*/
	getFilename: function( fullpath )
	{
		var pos = fullpath.lastIndexOf("/");
		//if(pos == -1) return fullpath;
		var question = fullpath.lastIndexOf("?");
		question = (question == -1 ? fullpath.length : (question - 1) ) - pos;
		return fullpath.substr(pos+1,question);
	},	

	/**
	* Returns the folder from a fullpath
	*
	* @method getFolder
	* @param {String} fullpath
	* @return {String} folder name
	*/
	getFolder: function(fullpath)
	{
		var pos = fullpath.lastIndexOf("/");
		return fullpath.substr(0,pos);
	},	

	/**
	* Returns the filename without the folder or the extension
	*
	* @method getBasename
	* @param {String} fullpath
	* @return {String} filename extension
	*/
	getBasename: function(fullpath)
	{
		var name = this.getFilename(fullpath);
		var pos = name.indexOf(".");
		if(pos == -1) return name;
		return name.substr(0,pos);
	},

	/**
	* Cleans resource name (removing double slashes)
	*
	* @method cleanFullpath
	* @param {String} fullpath
	* @return {String} fullpath cleaned
	*/
	cleanFullpath: function(fullpath)
	{
		//clean up the filename (to avoid problems with //)
		if(fullpath.indexOf("://") == -1)
			return fullpath.split("/").filter(function(v){ return !!v; }).join("/");
		return fullpath;
	},

	/**
	* Loads all the resources in the Object (it uses an object to store not only the filename but also the type)
	*
	* @method loadResources
	* @param {Object} resources contains all the resources, associated with its type
	* @param {Object}[options={}] options to apply to the loaded resources
	*/
	loadResources: function(res, options )
	{
		for(var i in res)
		{
			if( i[0] == ":" || i[0] == "_" )
				continue;
			this.load( i, options );
		}

		this._total_resources_to_load = this.num_resources_being_loaded;
		LEvent.trigger( this, "start_loading_resources", this._total_resources_to_load );
	},	

	/**
	* Set the base path where all the resources will be fetched (unless they have absolute URL)
	* By default it will use the website home address
	*
	* @method setPath
	* @param {String} url
	*/
	setPath: function( url )
	{
		this.path = url;
	},

	/**
	* Set a proxy url where all non-local resources will be requested, allows to fetch assets to other servers.
	* request will be in this form: proxy_url + "/" + url_with_protocol: ->   http://myproxy.com/google.com/images/...
	*
	* @method setProxy
	* @param {String} proxy_url
	*/
	setProxy: function( proxy_url )
	{
		if( proxy_url.indexOf("@") != -1 )
			this.proxy = "http://" + proxy_url.replace("@", window.location.host );
		else
			this.proxy = proxy_url;
	},

	/**
	* transform a url to a full url taking into account proxy, virtual file systems and local_repository
	*
	* @method getFullURL
	* @param {String} url
	* @param {Object} options
	* @return {String} full url
	*/
	getFullURL: function( url, options )
	{
		var pos = url.substr(0,10).indexOf(":");
		var protocol = "";
		if(pos != -1)
			protocol = url.substr(0,pos);

		var resources_path = this.path;
		if(options && options.force_local_url)
			resources_path = ".";

		//used special repository
		if(options && options.local_repository)
			resources_path = options.local_repository;

		if(protocol)
		{
			switch(protocol)
			{
				//external urls
				case 'http':
				case 'https':
					var full_url = url;
					var extension = this.getExtension( url ).toLowerCase();
					if(this.proxy && this.skip_proxy_extensions.indexOf( extension ) == -1 ) //proxy external files
						return this.proxy + url; //this.proxy + url.substr(pos+3); //"://"
					return full_url;
					break;
				case 'blob':
					return url; //special case for local urls like URL.createObjectURL
				case '': //strange case
					return url;
					break;
				default:
					if(url[0] == ":" || url[0] == "_") //local resource
						return url;
					//test for virtual file system address
					var root_path = this.virtual_file_systems[ protocol ] || resources_path;
					return root_path + "/" + url.substr(pos+1);
			}
		}
		else
			return resources_path + "/" + url;
	},

	/**
	* Allows to associate a resource path like "vfs:myfile.png" to an url according to the value before the ":".
	* This way we can have alias for different folders where the assets are stored.
	* P.e:   "e","http://domain.com"  -> will transform "e:myfile.png" in "http://domain.com/myfile.png"
	*
	* @method registerFileSystem
	* @param {String} name the filesystem name (the string before the colons in the path)
	* @param {String} url the url to attach before 
	*/
	registerFileSystem: function(name, url)
	{
		this.virtual_file_systems[ name ] = url;
	},

	/**
	* Returns the resource if it has been loaded, if you want to force to load it, use load
	*
	* @method getResource
	* @param {String} url where the resource is located (if its a relative url it depends on the path attribute)
	*/
	getResource: function( url )
	{
		if(!url)
			return null;
		url = this.cleanFullpath( url );
		return this.resources[ url ];
	},

	/**
	* Returns the resource type ("Mesh","Texture","Material","SceneNode",...) of a given resource
	*
	* @method getResourceType
	* @param {*} resource
	* @return {String} the type in string format
	*/
	getResourceType: function( resource )
	{
		if(!resource)
			return null;
		if(resource.object_type)
			return resource.object_type;
		if(resource.constructor.resource_type)
			return resource.constructor.resource_type;
		return LS.getObjectClassName( resource );
	},

	/**
	* Marks the resource as modified, used in editor to know when a resource data should be updated
	*
	* @method resourceModified
	* @param {Object} resource
	*/
	resourceModified: function(resource)
	{
		if(!resource)
			return;

		if(resource.constructor === String)
		{
			console.warn("resourceModified parameter must be a resource, not a string");
			return;
		}


		delete resource._original_data;
		delete resource._original_file;

		if(resource.remotepath)
			resource._modified = true;

		LEvent.trigger(this, "resource_modified", resource );
		
		if(resource.from_pack)
		{
			if (resource.from_pack.constructor === String)
			{
				var pack = LS.ResourcesManager.getResource( resource.from_pack );
				if(pack)
					this.resourceModified(pack);
			}
		}

	},

	/**
	* Unmarks the resource as modified
	*
	* @method resourceSaved
	* @param {Object} resource
	*/
	resourceSaved: function(resource)
	{
		if(!resource)
			return;
		delete resource._modified;
		resource.remotepath = resource.fullpath;
		LEvent.trigger(this, "resource_saved", resource );
	},

	/**
	* Loads a generic resource, the type will be infered from the extension, if it is json or wbin it will be processed
	* Do not use to load regular files (txts, csv, etc), instead use the LS.Network methods
	*
	* @method load
	* @param {String} url where the resource is located (if its a relative url it depends on the path attribute)
	* @param {Object}[options={}] options to apply to the loaded resource when processing it
	* @param {Function} [on_complete=null] callback when the resource is loaded and cached, params: callback( resource, url  ) //( url, resource, options )
	*/
	load: function( url, options, on_complete )
	{
		//parameter swap...
		if(options && options.constructor === Function && !on_complete )
		{
			on_complete = options;
			options = null;
		}

		//if we already have it, then nothing to do
		var resource = this.resources[url];
		if( resource != null && !resource.is_preview )
		{
			if(on_complete)
				on_complete(resource,url);
			return true;
		}

		options = options || {};

		//extract the filename extension
		var extension = this.getExtension( url );
		if(!extension) //unknown file type
		{
			console.warn("Cannot load a file without extension: " + url );
			return false;
		}

		if( this.resources_not_found[url] )
			return;

		//if it is already being loaded, then add the callback and wait
		if(this.resources_being_loaded[url])
		{
			this.resources_being_loaded[url].push( {options: options, callback: on_complete} );
			return;
		}

		if(this.resources_being_processed[url])
			return; //nothing to load, just waiting for the callback to process it

		if(!this.allow_base_files && url.indexOf("/") == -1)
			return; //this is not a valid file to load

		//otherwise we have to load it
		//set the callback
		this.resources_being_loaded[url] = [{options: options, callback: on_complete}];

		LEvent.trigger( LS.ResourcesManager, "resource_loading", url );
		//send an event if we are starting to load (used for loading icons)
		//if(this.num_resources_being_loaded == 0)
		//	LEvent.trigger( LS.ResourcesManager,"start_loading_resources", url );
		this.num_resources_being_loaded++;
		var full_url = this.getFullURL(url);

		//which type?
		var format_info = LS.Formats.getFileFormatInfo( extension );
		if(format_info && format_info.has_preview && !options.is_preview )
			LEvent.trigger( this, "load_resource_preview", url );

		//avoid the cache (if you want)
		var nocache = this.getNoCache();
		if(nocache)
			full_url += (full_url.indexOf("?") == -1 ? "?" : "&") + nocache;

		//create the ajax request
		var settings = {
			url: full_url,
			success: function(response){
				LS.ResourcesManager.processResource( url, response, options, ResourcesManager._resourceLoadedSuccess, true );
			},
			error: function(err) { 	
				LS.ResourcesManager._resourceLoadedError(url,err);
			},
			progress: function(e) { 
				var partial_load = 0;
				if(e.total) //sometimes we dont have the total so we dont know the amount
					partial_load = e.loaded / e.total;
				if( LEvent.hasBind(  LS.ResourcesManager, "resource_loading_progress" ) ) //used to avoid creating objects during loading
					LEvent.trigger( LS.ResourcesManager, "resource_loading_progress", { url: url, event: e, progress: partial_load } );
				if( LEvent.hasBind(  LS.ResourcesManager, "loading_resources_progress" ) ) //used to avoid creating objects during loading
					LEvent.trigger( LS.ResourcesManager, "loading_resources_progress", 1.0 - (LS.ResourcesManager.num_resources_being_loaded - partial_load) / LS.ResourcesManager._total_resources_to_load );
			}
		};

		//in case we need to force a response format 
		var format_info = LS.Formats.supported[ extension ];
		if( format_info && format_info.dataType ) //force dataType, otherwise it will be set by http server
			settings.dataType = format_info.dataType;

		//send the REQUEST
		LS.Network.request( settings ); //ajax call
		return false;
	},

	/**
	* Takes some resource data and transforms it to a resource (and Object ready to be used by the engine) and REGISTERs it in the ResourcesManager.
	* In most cases the process involves parsing and uploading to the GPU
	* It is called for every single resource that comes from an external source (URL) right after being loaded
	*
	* @method processResource
	* @param {String} url where the resource is located (if its a relative url it depends on the path attribute)
	* @param {*} data the data of the resource (could be string, arraybuffer, image... )
	* @param {Object}[options={}] options to apply to the loaded resource
	* @param {Function} on_complete once the resource is ready
	*/
	processResource: function( url, data, options, on_complete, was_loaded )
	{
		options = options || {};
		if( data === null || data === undefined )
			throw("No data found when processing resource: " + url);

		var resource = null;
		var extension = this.getExtension( url );

		//ugly but I dont see a work around to create this
		var process_final = function( url, resource, options ){
			if(!resource)
				return;

			LS.ResourcesManager.processFinalResource( url, resource, options, on_complete, was_loaded );

			//Keep original file inside the resource in case we want to save it
			if(LS.ResourcesManager.keep_files && (data.constructor == ArrayBuffer || data.constructor == String) && (!resource._original_data && !resource._original_file) )
				resource._original_data = data;
		}

		//this.resources_being_loaded[url] = [];
		this.resources_being_processed[url] = true;

		//no extension, then or it is a JSON, or an object with object_type or a WBin
		if(!extension)
			return this.processDataResource( url, data, options, process_final );

		//get all the info about this file format
		var format_info = LS.Formats.supported[ extension ];

		// PRE-PROCESSING Stage (transform raw data in a resource) 
		// *******************************************************

		//special preprocessor
		var preprocessor_callback = this.resource_pre_callbacks[ extension.toLowerCase() ];
		if(preprocessor_callback)
		{
			//this callback should return the resource or true if it is processing it
			var resource = preprocessor_callback( url, data, options, process_final );
			if(resource === true)
				return;
			if( resource )
				process_final( url, resource, options );
			else //resource is null
			{
				this._resourceLoadedError( url, "Resource couldnt be processed" );
				return;
			}
		}
		else if( format_info && (format_info.type || format_info.parse) ) //or you can rely on the format info parser
		{
			var resource = null;
			switch( format_info.type )
			{
				case "scene":
					resource = LS.ResourcesManager.processASCIIScene( url, data, options, process_final );
					break;
				case "mesh":
					resource = LS.ResourcesManager.processASCIIMesh( url, data, options, process_final );
					break;
				case "texture":
				case "image":
					resource = LS.ResourcesManager.processImage( url, data, options, process_final );
					break;
				default:
					if( format_info.parse )
					{
						//console.warn("Fallback to default parser");
						var resource = format_info.parse( data );
						if(resource)
							process_final( url, resource, options );
					}
					else
						console.warn("Format Info without parse function");
			}

			//we have a resource
			if( resource && resource !== true )
				process_final( url, resource, options );
		}
		else //or just store the resource as a plain data buffer
		{
			var resource = new LS.Resource();
			resource.filename = resource.fullpath = url;
			resource._data = data;
			process_final( url, resource, options );
		}
	},

	/**
	* Takes a resource instance, and adds some extra properties and register it
	*
	* @method processFinalResource
	* @param {String} url where the resource is located (if its a relative url it depends on the path attribute)
	* @param {*} the resource class
	* @param {Object}[options={}] options to apply to the loaded resource
	* @param {Function} on_complete once the resource is ready
	*/
	processFinalResource: function( fullpath, resource, options, on_complete, was_loaded )
	{
		if(!resource)
			return LS.ResourcesManager._resourceLoadedError( fullpath, "error processing the resource" );

		//EXTEND add properties as basic resource ********************************
		resource.filename = fullpath;
		if(options.filename) //used to overwrite
			resource.filename = options.filename;
		if(!options.is_local)
			resource.fullpath = fullpath;
		if(options.from_prefab)
			resource.from_prefab = options.from_prefab;
		if(options.from_pack)
			resource.from_pack = options.from_pack;
		if(was_loaded)
			resource.remotepath = fullpath; //it was url but is the same as fullpath?
		if(options.is_preview)
			resource.is_preview = true;

		//Remove from temporal containers
		if( LS.ResourcesManager.resources_being_processed[ fullpath ] )
			delete LS.ResourcesManager.resources_being_processed[ fullpath ];

		//Load associated resources (some resources like LS.Prefab or LS.SceneTree have other resources associated that must be loaded too)
		if(resource.getResources)
			ResourcesManager.loadResources( resource.getResources({}) );

		//REGISTER adds to containers *******************************************
		LS.ResourcesManager.registerResource( fullpath, resource );
		if(options.preview_of)
			LS.ResourcesManager.registerResource( options.preview_of, resource );

		//POST-PROCESS is done from inside registerResource, this way we ensure that every registered resource
		//has been post-processed, not only the loaded ones.

		//READY ***************************************
		if(on_complete)
			on_complete( fullpath, resource, options );
	},

	/**
	* Stores the resource inside the manager containers. This way it will be retrieveble by anybody who needs it.
	*
	* @method registerResource
	* @param {String} filename fullpath 
	* @param {Object} resource 
	*/
	registerResource: function( filename, resource )
	{
		if(!filename || !resource)
			throw("registerResource missing filename or resource");
		//clean up the filename (to avoid problems with //)
		filename = this.cleanFullpath( filename );

		if(this.resources[ filename ] == resource)
			return; //already registered

		if(resource.is_preview && this.resources[ filename ] )
			return; //previews cannot overwrite resources

		resource.filename = filename; //filename is a given name
		//resource.fullpath = filename; //fullpath only if they are in the server

		//Compute resource type
		if(!resource.object_type)
			resource.object_type = LS.getObjectClassName( resource );
		var type = resource.object_type;
		if(resource.constructor.resource_type)
			type = resource.constructor.resource_type;

		//Add to global container
		this.resources[ filename ] = resource;

		//POST-PROCESS resources extra final action (done here to ensure any registered resource is post-processed)
		var post_callback = this.resource_post_callbacks[ type ];
		if(post_callback)
			post_callback( filename, resource );

		//send message to inform new resource is available
		if(!resource.is_preview)
			LEvent.trigger(this,"resource_registered", resource);

		LS.GlobalScene.refresh(); //render scene
	},	

	/**
	* removes the resources from all the containers
	*
	* @method unregisterResource
	* @param {String} filename 
	* @return {boolean} true is removed, false if not found
	*/
	unregisterResource: function(filename)
	{
		var resource = this.resources[filename];

		if(!resource)
			return false; //not found

		delete this.resources[filename];

		//ugly: too hardcoded, maybe implement unregister_callbacks
		if( this.meshes[filename] )
			delete this.meshes[ filename ];
		if( this.textures[filename] )
			delete this.textures[ filename ];
		if( this.materials[filename] )
			delete this.materials[ filename ];

		if(resource.constructor === LS.Pack || resource.constructor === LS.Prefab)
			resource.setResourcesLink(null);

		LEvent.trigger(this,"resource_unregistered", resource);
		LS.GlobalScene.refresh(); //render scene
		return true;
	},

	/**
	* Used to load files and get them as File (or Blob)
	* @method getURLasFile
	* @param {String} filename 
	* @return {File} the file
	*/
	getURLasFile: function( url, on_complete )
	{
		var oReq = new XMLHttpRequest();
		oReq.open("GET", this.getFullURL(url), true);
		oReq.responseType = "blob";
		oReq.onload = function(oEvent) {
		  var blob = oReq.response;
		  if(on_complete)
			  on_complete(blob, url);
		};
		oReq.send();
	},

	/**
	* Changes the name of a resource and sends an event to all components to change it accordingly
	* @method renameResource
	* @param {String} old 
	* @param {String} newname
	* @param {Boolean} [skip_event=false] ignore sending an event to all components to rename the resource
	* @return {boolean} if the file was found
	*/
	renameResource: function(old, newname, skip_event)	
	{
		var res = this.resources[ old ];
		if(!res)
			return false;

		res.filename = newname;
		if(res.fullpath)
			res.fullpath = newname;

		this.resources[newname] = res;
		delete this.resources[ old ];

		if(!skip_event)
			this.sendResourceRenamedEvent(old, newname, res);

		//ugly: too hardcoded
		if( this.meshes[old] ) {
			delete this.meshes[ old ];
			this.meshes[ newname ] = res;
		}
		if( this.textures[old] ) {
			delete this.textures[ old ];
			this.textures[ newname ] = res;
		}
		if( this.materials[old] ) {
			delete this.materials[ old ];
			this.materials[ newname ] = res;
		}

		this.resources_renamed_recently[ old ] = newname;
		return true;
	},

	/**
	* Tells if it is loading resources
	*
	* @method isLoading
	* @return {Boolean}
	*/
	isLoading: function()
	{
		return this.num_resources_being_loaded > 0;
	},	

	/**
	* forces to try to reload again resources not found
	*
	* @method isLoading
	* @return {Boolean}
	*/
	clearNotFoundResources: function()
	{
		this.resources_not_found = {};
	},

	computeImageMetadata: function(texture)
	{
		var metadata = { width: texture.width, height: texture.height };
		return metadata;
	},

	/**
	* returns a mesh resource if it is loaded
	*
	* @method getMesh
	* @param {String} filename 
	* @return {Mesh}
	*/
	getMesh: function(name) {
		if(!name)
			return null;
		if(name.constructor === String)
			return this.meshes[name];
		if(name.constructor === GL.Mesh)
			return name;
		return null;
	},

	/**
	* returns a texture resource if it is loaded
	*
	* @method getTexture
	* @param {String} filename could be a texture itself in which case returns the same texture
	* @return {Texture} 
	*/
	getTexture: function(name) {
		if(!name)
			return null;
		if(name.constructor === String)
			return this.textures[name];
		if(name.constructor === GL.Texture)
			return name;
		return null;
	},

	getMaterial: function( name_or_id )
	{
		if(!name_or_id)
			return;
		if(name_or_id[0] == "@")
			return this.materials_by_uid[ name_or_id ];
		return this.materials[ name_or_id ];
	},

	//tells to all the components, nodes, materials, etc, that one resource has changed its name so they can update
	sendResourceRenamedEvent: function( old_name, new_name, resource )
	{
		var scene = LS.GlobalScene;
		for(var i = 0; i < scene._nodes.length; i++)
		{
			//nodes
			var node = scene._nodes[i];

			//components
			for(var j = 0; j < node._components.length; j++)
			{
				var component = node._components[j];
				if(component.onResourceRenamed)
					component.onResourceRenamed( old_name, new_name, resource )
			}
	
			//materials
			var material = node.getMaterial();
			if(material && material.onResourceRenamed)
				material.onResourceRenamed(old_name, new_name, resource)
		}
	},

	/**
	* Binds a callback for when a resource is loaded (in case you need to do something special)
	*
	* @method onceLoaded
	* @param {String} fullpath of the resource you want to get the notification once is loaded
	* @param {Function} callback the function to call, it will be called as callback( fullpath, resource )
	*/
	onceLoaded: function( fullpath, callback )
	{
		var array = this.resource_once_callbacks[ fullpath ];
		if(!array)
		{
			this.resource_once_callbacks[ fullpath ] = [ callback ];
			return;
		}

		//avoid repeating
		for(var i in array)
			if( array[i] == callback )
				return;
		array.push( callback );
	},

	//*************************************

	//Called after a resource has been loaded successfully and processed
	_resourceLoadedSuccess: function(url,res)
	{
		if( LS.ResourcesManager.debug )
			console.log("RES: " + url + " ---> " + LS.ResourcesManager.num_resources_being_loaded);

		for(var i in LS.ResourcesManager.resources_being_loaded[url])
		{
			if( LS.ResourcesManager.resources_being_loaded[url][i].callback != null )
				LS.ResourcesManager.resources_being_loaded[url][i].callback( res, url );
		}

		//triggers 'once' callbacks
		if(LS.ResourcesManager.resource_once_callbacks[ url ])
		{
			var v = LS.ResourcesManager.resource_once_callbacks[url];
			for(var i in v)
				v[i](url, res);
			delete LS.ResourcesManager.resource_once_callbacks[url];
		}

		//two pases, one for launching, one for removing
		if( LS.ResourcesManager.resources_being_loaded[url] )
		{
			delete LS.ResourcesManager.resources_being_loaded[url];
			LS.ResourcesManager.num_resources_being_loaded--;
			LEvent.trigger( LS.ResourcesManager, "resource_loaded", url );
			LEvent.trigger( LS.ResourcesManager, "loading_resources_progress", 1.0 - LS.ResourcesManager.num_resources_being_loaded / LS.ResourcesManager._total_resources_to_load );
			if( LS.ResourcesManager.num_resources_being_loaded == 0)
			{
				LEvent.trigger( LS.ResourcesManager, "end_loading_resources", true);
				LS.ResourcesManager._total_resources_to_load = 0;
			}
		}
	},

	_resourceLoadedError: function( url, error )
	{
		console.log("Error loading " + url);
		delete LS.ResourcesManager.resources_being_loaded[url];
		delete LS.ResourcesManager.resource_once_callbacks[url];
		LS.ResourcesManager.resources_not_found[url] = true;
		LEvent.trigger( LS.ResourcesManager, "resource_not_found", url);
		LS.ResourcesManager.num_resources_being_loaded--;
		if( LS.ResourcesManager.num_resources_being_loaded == 0 )
			LEvent.trigger( LS.ResourcesManager, "end_loading_resources", false);
			//$(ResourcesManager).trigger("end_loading_resources");
	}
};

LS.RM = LS.ResourcesManager = ResourcesManager;

LS.getTexture = function( name_or_texture ) {
	return LS.ResourcesManager.getTexture( name_or_texture );
}	


// Resources readers and processors *********************************************
// When loading resources there are two stages:
// * Pre-process: extract from a container, parse raw data and transform it in a LS resource class (Texture,Mesh,SceneNode,Resource, ...)
// * Post-processed: validate, add extra metadata, and register
// This actions depend on the resource type, and format, and it is open so future formats are easy to implement.

//global formats: take a file and extract info
LS.ResourcesManager.registerResourcePreProcessor("wbin", function( filename, data, options) {

	//WBin will detect there is a class name inside the data and do the conversion to the specified class (p.e. a Prefab or a Mesh)
	var data = WBin.load( data );
	return data;
},"binary");

LS.ResourcesManager.registerResourcePreProcessor("json", function(filename, data, options) {
	var resource = data;
	if( data.constructor === String )
		data = JSON.parse( data );

	if( data.object_type )
	{
		var ctor = LS.Classes[ data.object_type ] || window[ data.object_type ];
		if(ctor)
		{
			if(ctor.prototype.configure)
			{
				resource = new ctor();
				resource.configure( data );
			}
			else
				resource = new ctor( data );
		}
		else
			console.warn( "JSON object_type class not found: " + data.object_type );
	}
	else
	{
		//unknown JSON, create a resource
		resource = new LS.Resource();
		resource.filename = filename;
		resource._data = data;
		resource.type = "json";
		resource.category = "json";
	}
	return resource;
});

//For resources without file extension (JSONs and WBINs)
LS.ResourcesManager.processDataResource = function( url, data, options, callback )
{
	//JSON?
	if( data.constructor === String )
		data = JSON.parse(data);

	//WBIN?
	if(data.constructor == ArrayBuffer)
	{
		resource = WBin.load(data);
		if(callback)
			callback(url, resource, options);
		return resource;
	}

	//JS OBJECT?
	var class_name = data.object_type;
	if(class_name && LS.Classes[class_name] )
	{
		var ctor = LS.Classes[class_name];
		var resource = null;
		if(ctor.prototype.configure)
		{
			resource = new LS.Classes[class_name]();
			resource.configure( data );
		}
		else
			resource = new LS.Classes[class_name]( data );
		if(callback)
			callback(url, resource, options);
		return resource;
	}

	console.warn("Resource Class name unknown: " + class_name );
	return false;
}

//Images ********

//Takes image data in some raw format and transforms it in regular image data, then converts it to GL.Texture
LS.ResourcesManager.processImage = function( filename, data, options, callback ) {

	var extension = LS.ResourcesManager.getExtension(filename);
	var mimetype = "application/octet-stream";
	if(extension == "jpg" || extension == "jpeg")
		mimetype = "image/jpg";
	else if(extension == "webp")
		mimetype = "image/webp";
	else if(extension == "gif")
		mimetype = "image/gif";
	else if(extension == "png")
		mimetype = "image/png";
	else {
		var format = LS.Formats.supported[ extension ];
		if(format.mimetype)
			mimetype = format.mimetype;
		else
		{
			var texture = this.processImageNonNative( filename, data, options );
			inner_on_texture( texture );
			return;
		}
	}

	//blob and load
	var blob = new Blob([data],{type: mimetype});
	var objectURL = URL.createObjectURL( blob );

	//regular image
	var image = new Image();
	image.src = objectURL;
	image.real_filename = filename; //hard to get the original name from the image
	image.onload = function()
	{
		var filename = this.real_filename;
		var texture = LS.ResourcesManager.processTexture( filename, this, options );
		inner_on_texture( texture );
	}
	image.onerror = function(err){
		URL.revokeObjectURL(objectURL); //free memory
		if(callback)
			callback( filename, null, options );
		console.error("Error while loading image, file is not native image format: " + filename); //error if image is not an image I guess
	}

	function inner_on_texture( texture )
	{
		if(texture)
		{
			//LS.ResourcesManager.registerResource( filename, texture ); //this is done already by processResource
			if(LS.ResourcesManager.keep_files)
				texture._original_data = data;
		}
		URL.revokeObjectURL(objectURL); //free memory
		if(callback)
			callback(filename,texture,options);
	}

	return true;
}

//Similar to processImage but for non native file formats
LS.ResourcesManager.processImageNonNative = function( filename, data, options ) {

	//clone because DDS changes the original data
	var cloned_data = new Uint8Array(data).buffer;
	var texture_data = LS.Formats.parse( filename, cloned_data, options );

	if(texture_data.constructor == GL.Texture)
	{
		var texture = texture_data;
		texture.filename = filename;
		texture._original_data = cloned_data;
		return texture;
	}

	//texture in object format
	var texture = LS.ResourcesManager.processTexture( filename, texture_data );
	return texture;
}

//Takes one image (or canvas or object with width,height,pixels) as input and creates a GL.Texture
LS.ResourcesManager.processTexture = function(filename, img, options)
{
	if(img.width == (img.height / 6) || filename.indexOf("CUBECROSS") != -1) //cubemap
	{
		var cubemap_options = { wrapS: gl.MIRROR, wrapT: gl.MIRROR, magFilter: gl.LINEAR, minFilter: gl.LINEAR_MIPMAP_LINEAR };
		if( filename.indexOf("CUBECROSSL") != -1 )
			cubemap_options.is_cross = 1;
		var texture = GL.Texture.cubemapFromImage( img, cubemap_options );
		if(!texture) //happens if the image is not a cubemap
			return;
		texture.img = img;
	}
	else //regular texture
	{
		var default_mag_filter = gl.LINEAR;
		var default_wrap = gl.REPEAT;
		//var default_min_filter = img.width == img.height ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR;
		var default_min_filter = gl.LINEAR_MIPMAP_LINEAR;
		if( !isPowerOfTwo(img.width) || !isPowerOfTwo(img.height) )
		{
			default_min_filter = gl.LINEAR;
			default_wrap = gl.CLAMP_TO_EDGE; 
		}
		var texture = null;

		//from TGAs...
		if(img.pixels) //not a real image, just an object with width,height and a buffer with all the pixels
			texture = GL.Texture.fromMemory(img.width, img.height, img.pixels, { format: (img.bpp == 24 ? gl.RGB : gl.RGBA), no_flip: img.flipY, wrapS: gl.REPEAT, wrapT: gl.REPEAT, magFilter: default_mag_filter, minFilter: default_min_filter });
		else //default format is RGBA (because particles have alpha)
			texture = GL.Texture.fromImage(img, { format: gl.RGBA,  wrapS: default_wrap, wrapT: default_wrap, magFilter: default_mag_filter, minFilter: default_min_filter });
		if(!texture)
			return;
		texture.img = img;
	}

	texture.filename = filename;
	texture.generateMetadata(); //useful
	return texture;
}

//Transform ascii mesh data in a regular GL.Mesh
LS.ResourcesManager.processASCIIMesh = function(filename, data, options) {

	var mesh_data = LS.Formats.parse( filename, data, options );

	if(mesh_data == null)
	{
		console.error("Error parsing mesh: " + filename);
		return null;
	}

	var mesh = GL.Mesh.load(mesh_data);
	return mesh;
}

//Transform scene data in a SceneNode
LS.ResourcesManager.processASCIIScene = function( filename, data, options ) {
	//options = options || {};

	var scene_data = LS.Formats.parse( filename, data, options );

	if(scene_data == null)
	{
		console.error("Error parsing mesh: " + filename);
		return null;
	}

	//resources (meshes, textures...)
	for(var i in scene_data.meshes)
	{
		var mesh = scene_data.meshes[i];
		LS.ResourcesManager.processResource( i, mesh );
	}

	//used for anims mostly
	for(var i in scene_data.resources)
	{
		var res = scene_data.resources[i];
		LS.ResourcesManager.processResource(i,res);
	}

	for(var i in scene_data.materials)
	{
		var material = scene_data.materials[i];
		LS.ResourcesManager.processResource(i,material);
	}

	var node = new LS.SceneNode();
	node.configure( scene_data.root );

	//if(options.insert)
	//	LS.GlobalScene.root.addChild( node );

	return node;
}

//LS.ResourcesManager.registerResourcePreProcessor("jpg,jpeg,png,webp,gif", LS.ResourcesManager.processImage, "binary","Texture");
//LS.ResourcesManager.registerResourcePreProcessor("dds,tga", LS.ResourcesManager.processImageNonNative );
//LS.ResourcesManager.registerResourcePreProcessor("obj,ase", LS.ResourcesManager.processASCIIMesh, "text","Mesh");
//LS.ResourcesManager.registerResourcePreProcessor("stl", LS.ResourcesManager.processASCIIMesh, "binary","Mesh");
//LS.ResourcesManager.registerResourcePreProcessor("dae", LS.ResourcesManager.processASCIIScene, "text", "SceneTree");


// Post processors **********************************************************************************
// Take a resource already processed and does some final actions (like validate, register or compute metadata)

LS.ResourcesManager.registerResourcePostProcessor("Mesh", function(filename, mesh ) {

	mesh.object_type = "Mesh"; //useful
	if(mesh.metadata)
	{
		mesh.metadata = {};
		mesh.generateMetadata(); //useful
	}
	if(!mesh.bounding || mesh.bounding.length != BBox.data_length)
	{
		mesh.bounding = null; //remove bad one (just in case)
		mesh.updateBounding();
	}
	if(!mesh.getBuffer("normals"))
		mesh.computeNormals();

	if(LS.ResourcesManager.free_data) //free buffers to reduce memory usage
		mesh.freeData();

	LS.ResourcesManager.meshes[filename] = mesh;
});

LS.ResourcesManager.registerResourcePostProcessor("Texture", function( filename, texture ) {
	//store
	LS.ResourcesManager.textures[filename] = texture;
});

LS.ResourcesManager.registerResourcePostProcessor("Material", function( filename, material ) {
	//store
	LS.ResourcesManager.materials[filename] = material;
	LS.ResourcesManager.materials_by_uid[ material.uid ] = material;
	material.prepareMaterial( LS.GlobalScene );
});

LS.ResourcesManager.registerResourcePostProcessor("Pack", function( filename, pack ) {
	//flag contents to specify where do they come from
	pack.flagResources();
});

LS.ResourcesManager.registerResourcePostProcessor("Prefab", function( filename, prefab ) {
	//apply to nodes in the scene
	prefab.applyToNodes();
});

/* Basic shader manager 
	- Allows to load all shaders from XML
	- Allows to use a global shader
*/

//************************************
/**
* ShadersManager is the static class in charge of loading, compiling and storing shaders for reuse.
*
* @class ShadersManager
* @namespace LS
* @constructor
*/

var ShadersManager = {

	default_xml_url: "data/shaders.xml",

	snippets: {},//to save source snippets
	compiled_programs: {}, //shaders already compiled and ready to use
	compiled_shaders: {}, //every vertex and fragment shader compiled

	global_shaders: {}, //shader codes to be compiled using some macros
	templates: {}, //WIP

	default_shader: null, //a default shader to rely when a shader is not found
	dump_compile_errors: true, //dump errors in console
	on_compile_error: null, //callback 

	/**
	* Initializes the shader manager
	*
	* @method init
	* @param {string} url a url to a shaders.xml can be specified to load the shaders
	*/
	init: function(url, ignore_cache)
	{
		//set a default shader 
		this.default_shader = null;

		//storage
		this.compiled_programs = {};
		this.compiled_shaders = {};
		this.global_shaders = {};

		//base intro code for shaders
		this.global_extra_code = String.fromCharCode(10) + "#define WEBGL" + String.fromCharCode(10);

		//compile some shaders
		this.createDefaultShaders();

		//if a shader is not found, the default shader is returned, in this case a flat shader
		this.default_shader = this.get("flat");

		url = url || this.default_xml_url;
		this.last_shaders_url = url;
		this.loadFromXML(url, false, ignore_cache);
	},

	/**
	* Reloads the XML file with the shaders, useful when editing the file
	*
	* @method reloadShaders
	* @param {function} on_complete call when the shaders have been reloaded
	*/
	reloadShaders: function(on_complete)
	{
		this.loadFromXML( this.last_shaders_url, true,true, on_complete);
	},

	/**
	* Resolves a shader query, returns the shader
	*
	* @method resolve
	* @param {ShaderQuery} query
	* @return {GL.Shader} the shader, if not found the default shader is returned
	*/
	resolve: function( query )
	{
		return this.get( query.name, query.macros );
	},

	/**
	* Clears all the compiled shaders
	*
	* @method clearCache
	*/
	clearCache: function()
	{
		this.compiled_programs = {};
		this.compiled_shaders = {};
	},

	/**
	* Returns a compiled shader with this id and this macros
	*
	* @method get
	* @param {string} id
	* @param {string} macros
	* @return {GL.Shader} the shader, if not found the default shader is returned
	*/
	get: function( id, macros )
	{
		if(!id)
			return this.default_shader;

		//if there is no macros, just get the old one
		if(!macros)
		{
			var shader = this.compiled_programs[id];
			if (shader)
				return shader;
		}

		var global = this.global_shaders[id];

		if (global == null)
			return this.default_shader;

		var key = id + ":";
		var extracode = "";

		if(global.num_macros != 0)
		{
			//generate unique key
			for (var macro in macros)
			{
				if (global.macros[ macro ])
				{
					key += macro + "=" + macros[macro] + ":";
					extracode += String.fromCharCode(10) + "#define " + macro + " " + macros[macro] + String.fromCharCode(10); //why not "\n"??????
				}
			}//for macros
		}

		//hash key
		var hashkey = key.hashCode();

		//already compiled
		if (this.compiled_programs[hashkey] != null)
			return this.compiled_programs[hashkey];

		var start_time = 0;
		if (this.debug)
			start_time = getTime();

		//compile and store it
		var vs_code = extracode + global.vs_code;
		var fs_code = extracode + global.fs_code;

		//expand code
		if(global.imports)
		{
			var already_imported = {}; //avoid to import two times the same code to avoid collisions

			var replace_import = function(v)
			{
				var token = v.split("\"");
				var id = token[1];
				if( already_imported[ id ] )
					return "//already imported: " + id + "\n";
				var snippet = ShadersManager.snippets[id];
				already_imported[id] = true;
				if(snippet)
					return snippet.code;
				return "//snippet not found: " + id + "\n";
			}

			vs_code = vs_code.replace(/#import\s+\"(\w+)\"\s*\n/g, replace_import );
			already_imported = {}; //clear
			fs_code	= fs_code.replace(/#import\s+\"(\w+)\"\s*\n/g, replace_import);
		}

		var shader = this.compileShader( vs_code, fs_code, key );
		if(shader)
			shader.global = global;

		if(this.debug)
			console.log("Time creating shader:", (getTime() - start_time).toFixed(3), "ms");

		return this.registerCompiledShader(shader, hashkey, id);
	},

	/**
	* Returns the info of a global shader
	*
	* @method getGlobalShaderInfo
	* @param {string} id
	* @return {Object} shader info (code, macros supported, flags)
	*/
	getGlobalShaderInfo: function(id)
	{
		return this.global_shaders[id];
	},

	/**
	* Compiles a shader, the vertex and fragment shader are cached indepently to speed up compilations but a unique name must be provided
	*
	* @method compileShader
	* @param {string} vs_code the final source code for the vertex shader
	* @param {string} fs_code the final source code for the fragment shader
	* @param {string} name an unique name that should be associated with this shader
	* @return {GL.Shader} shader
	*/
	compileShader: function( vs_code, fs_code, name )
	{
		if(!name)
			throw("compileShader must have a name specified");

		if(!gl)
			return null;
		var shader = null;
		try
		{
			vs_code = this.global_extra_code + vs_code;
			fs_code = this.global_extra_code + fs_code;

			//speed up compilations by caching shaders compiled
			var vs_shader = this.compiled_shaders[name + ":VS"];
			if(!vs_shader)
				vs_shader = this.compiled_shaders[name + ":VS"] = GL.Shader.compileSource(gl.VERTEX_SHADER, vs_code);
			var fs_shader = this.compiled_shaders[name + ":FS"];
			if(!fs_shader)
				fs_shader = this.compiled_shaders[name + ":FS"] = GL.Shader.compileSource(gl.FRAGMENT_SHADER, fs_code);

			var old = getTime();
			shader = new GL.Shader( vs_shader, fs_shader );
			if(this.debug)
				console.log("Shader compile time: ", (getTime() - old).toFixed(3), "ms");
			shader.name = name;
			//console.log("Shader compiled: " + name);
		}
		catch (err)
		{
			if(this.dump_compile_errors)
			{
				console.error("Error compiling shader: " + name);
				console.log(err);
				console.groupCollapsed("Vertex Shader Code");
				//console.log("VS CODE\n************");
				var lines = (this.global_extra_code + vs_code).split("\n");
				for(var i in lines)
					console.log(i + ": " + lines[i]);
				console.groupEnd();

				console.groupCollapsed("Fragment Shader Code");
				//console.log("FS CODE\n************");
				lines = (this.global_extra_code + fs_code).split("\n");
				for(var i in lines)
					console.log(i + ": " + lines[i]);
				console.groupEnd();
				this.dump_compile_errors = false; //disable so the console dont get overflowed
			}

			if(this.on_compile_error)
				this.on_compile_error(err);

			return null;
		}
		return shader;
	},

	/**
	* Stores a compiled shader program, so it can be reused
	*
	* @method registerCompiledShader
	* @param {GL.Shader} shader the compiled shader
	* @param {string} key unique id 
	* @param {string} id the shader name
	* @return {GL.Shader} shader
	*/
	registerCompiledShader: function(shader, key, id)
	{
		if(shader == null)
		{
			this.compiled_programs[key] = this.default_shader;
			return this.default_shader;
		}

		shader.id = id;
		shader.key = key;
		this.compiled_programs[key] = shader;
		return shader;
	},

	/**
	* Loads shaders code from an XML file
	*
	* @method loadFromXML
	* @param {string} url to the shaders file
	* @param {boolean} reset_old to reset all the existing shaders once loaded
	* @param {boolean} ignore_cache force to ignore web cache 
	* @param {function} on_complete callback once the file has been loaded and processed
	*/
	loadFromXML: function (url, reset_old, ignore_cache, on_complete)
	{
		var nocache = ignore_cache ? "?nocache=" + getTime() + Math.floor(Math.random() * 1000) : "";
		LS.Network.request({
		  url: url + nocache,
		  dataType: 'xml',
		  success: function(response){
				console.log("Shaders XML loaded: " + url);
				if(reset_old)
				{
					LS.ShadersManager.global_shaders = {};
					LS.ShadersManager.compiled_programs = {};
					LS.ShadersManager.compiled_shaders = {};
				}
				LS.ShadersManager.processShadersXML(response);
				if(on_complete)
					on_complete();
		  },
		  error: function(err){
			  console.log("Error parsing Shaders XML: " + err);
			  throw("Error parsing Shaders XML: " + err);
		  }
		});	
	},

	/**
	* extracts all the shaders from the XML doc
	*
	* @method processShadersXML
	* @param {XMLDocument} xml
	*/
	processShadersXML: function(xml)
	{
		//get shaders
		var shaders = xml.querySelectorAll('shader');
		
		for(var i in shaders)
		{
			var shader_element = shaders[i];
			if(!shader_element || !shader_element.attributes) continue;

			var id = shader_element.attributes["id"];
			if(!id) continue;
			id = id.value;

			var vs_code = "";
			var fs_code = "";

			//read all the supported macros
			var macros_str = "";
			var macros_attr = shader_element.attributes["macros"];
			if(macros_attr)
				macros_str += macros_attr.value;

			var macros_xml = shader_element.querySelector("macros");
			if(macros_xml)
				macros_str += macros_xml.textContent;

			var macros_array = macros_str.split(",");
			var macros = {};
			for(var i in macros_array)
				macros[ macros_array[i].trim() ] = true;

			//read the shaders code
			vs_code = shader_element.querySelector("code[type='vertex_shader']").textContent;
			fs_code = shader_element.querySelector("code[type='pixel_shader']").textContent;

			if(!vs_code || !fs_code)
			{
				console.log("no code in shader: " + id);
				continue;
			}

			var options = {};

			var multipass = shader_element.getAttribute("multipass");
			if(multipass)
				options.multipass = (multipass == "1" || multipass == "true");
			var imports = shader_element.getAttribute("imports");
			if(imports)
				options.imports = (imports == "1" || imports == "true");
			var events = shader_element.getAttribute("events");
			if(events)
				options.events = (events == "1" || events == "true");

			LS.ShadersManager.registerGlobalShader( vs_code, fs_code, id, macros, options );
		}

		var snippets = xml.querySelectorAll('snippet');
		for(var i = 0; i < snippets.length; ++i)
		{
			var snippet = snippets[i];
			var id = snippet.getAttribute("id");
			var code = snippet.textContent;
			this.registerSnippet( id, code );
		}

		var templates = xml.querySelectorAll('template');
		for(var i = 0; i < templates.length; ++i)
		{
			var template = templates[i];
			var id = template.getAttribute("id");
			var vs_code = template.querySelector("code[type='vertex_shader']").textContent;
			var fs_code = template.querySelector("code[type='fragment_shader']").textContent;

			var vs_info = this.processTemplateCode( vs_code );
			var fs_info = this.processTemplateCode( fs_code );

			template[id] = {
				id: id,
				vs_info: vs_info,
				fs_info: fs_info
			}

			console.log( template[id] );
		}

		this.ready = true;
	},
	
	//adds source code of a shader that could be compiled if needed
	//id: name
	//macros: supported macros by the shader
	/**
	* extracts all the shaders from the XML doc
	*
	* @method registerGlobalShader
	* @param {string} vs_code
	* @param {string} fs_code
	*/
	registerGlobalShader: function(vs_code, fs_code, id, macros, options )
	{
		//detect macros
		var macros_found = {};
		//TO DO using a regexp

		//count macros
		var num_macros = 0;
		for(var i in macros)
			num_macros += 1;

		//HACK for IE
		if(gl && !gl.extensions["WEBGL_draw_buffers"])
			fs_code = fs_code.replace("#extension GL_EXT_draw_buffers : enable", '');

		var global = { 
			vs_code: vs_code, 
			fs_code: fs_code,
			macros: macros,
			num_macros: num_macros
		};

		//add options
		if(options)
		{
			for(var i in options)
				global[i] = options[i];

			//process code
			if(options.events)
			{
				var replace_events = function(v)
				{
					var token = v.split("\"");
					var id = token[1];
					//console.log("Event: ",id);
					return "";
				}

				global.vs_code = vs_code.replace(/#event\s+\"(\w+)\"\s*\n/g, replace_events );
				global.fs_code = fs_code.replace(/#event\s+\"(\w+)\"\s*\n/g, replace_events);
			}
		}

		this.global_shaders[id] = global;
		LEvent.trigger( LS.ShadersManager, "newShader" );
		return global;
	},

	/*
	registerGlobalShader: function(vs_code, fs_code, id, macros, options )
	{
		//detect macros
		var macros_found = {};
		//TO DO using a regexp

		//count macros
		var num_macros = 0;
		for(var i in macros)
			num_macros += 1;

		var global = { 
			vs_code: vs_code, 
			fs_code: fs_code,
			macros: macros,
			num_macros: num_macros
		};

		//add options
		if(options)
		{
			for(var i in options)
				global[i] = options[i];

				var vs_areas = vs_code.split("#pragma");
				var fs_areas = fs_code.split("#pragma");
				

				global.vs_code = vs_code.replace(/#event\s+\"(\w+)\"\s*\n/g, replace_events );
				global.fs_code = fs_code.replace(/#event\s+\"(\w+)\"\s*\n/g, replace_events);
			}
		}

		this.global_shaders[id] = global;
		LEvent.trigger(ShadersManager,"newShader");
		return global;
	},
	*/


	/**
	* Register a code snippet ready to be used by the #import clause in the shader
	*
	* @method registerSnippet
	* @param {string} id
	* @param {string} code
	*/
	registerSnippet: function(id, code)
	{
		this.snippets[ id ] = { id: id, code: code };
	},

	/**
	* Returns the code of a snipper
	*
	* @method getSnippet
	* @param {string} id
	* @return {string} code
	*/
	getSnippet: function(id)
	{
		return this.snippets[ id ];
	},

	//this is global code for default shaders
	common_vscode: "\n\
		precision mediump float;\n\
		attribute vec3 a_vertex;\n\
		attribute vec3 a_normal;\n\
		attribute vec2 a_coord;\n\
		uniform mat4 u_mvp;\n\
	",
	common_fscode: "\n\
		precision mediump float;\n\
	",

	/**
	* Create some default shaders useful for generic situations (flat, texture and screenspace quad)
	*
	* @method createDefaultShaders
	* @param {string} id
	* @return {string} code
	*/
	createDefaultShaders: function()
	{
		//flat
		this.registerGlobalShader(this.common_vscode + '\
			void main() {\
				gl_Position = u_mvp * vec4(a_vertex,1.0);\
			}\
			', this.common_fscode + '\
			uniform vec4 u_material_color;\
			void main() {\
			  gl_FragColor = vec4(u_material_color);\
			}\
		',"flat");

		//flat texture
		this.registerGlobalShader(this.common_vscode + '\
			varying vec2 v_uvs;\
			void main() {\n\
				v_uvs = a_coord;\n\
				gl_Position = u_mvp * vec4(a_vertex,1.0);\
			}\
			', this.common_fscode + '\
			uniform vec4 u_material_color;\
			varying vec2 v_uvs;\
			uniform sampler2D texture;\
			void main() {\
				gl_FragColor = u_material_color * texture2D(texture,v_uvs);\
			}\
		',"texture_flat");

		this.registerGlobalShader(this.common_vscode + '\
			varying vec2 coord;\
			void main() {\
			coord = a_coord;\
			gl_Position = vec4(coord * 2.0 - 1.0, 0.0, 1.0);\
		}\
		', this.common_fscode + '\
			uniform sampler2D texture;\
			uniform vec4 color;\
			varying vec2 coord;\
			void main() {\
			gl_FragColor = texture2D(texture, coord) * color;\
			}\
		',"screen");
	},

	processTemplateCode: function( code )
	{
		//remove comments
		code = code.replace(/(\/\*([\s\S]*?)\*\/)|(\/\/(.*)$)/gm, '');

		var hooks = {};
		var parts = [];
		var current_part = [];

		var lines = code.split("\n");
		for(var i = 0; i < lines.length; i++)
		{
			var line = lines[i].trim();
			if(!line.length)
				continue;//empty line
			if(line[0] != "#")
			{
				current_part.push(line);
				continue;
			}

			var t = line.split(" ");
			if(t[0] == "#pragma")
			{
				switch(t[1])
				{
					case "import":
						if( current_part.length )
						{
							parts.push( [ "code", current_part.join("\n") ] );
							current_part = [];
						}
						parts.push( [ "import", t[3] ] );
						break;
					case "hook": 
						if( current_part.length )
						{
							parts.push( [ "code", current_part.join("\n") ] );
							current_part = [];
						}
						if( hooks[ t[3] ] !== undefined )
							console.warn("Hook already found in shader: " + t[3] );
						hooks[ t[3] ] = parts.length;
						parts.push( [ "hook", t[3] ] );
						break;
					default:
						current_part.push(line); //unknown pragma, pass it
				}
			}
			else
				current_part.push(line); //unknown macro, pass it
		}

		return {
			code: code,
			parts: parts,
			hooks: hooks
		};
	}
};

LS.SM = LS.ShadersManager = ShadersManager;


/**
* ShadersManager is the static class in charge of loading, compiling and storing shaders for reuse.
*
* @class ShaderQuery
* @namespace LS
* @constructor
*/
function ShaderQuery( name, macros )
{
	this.name = name;
	this.macros = {}; //macros to add
	this.hooks = {}; //represent points where this shader want to insert code

	if(macros)
		for(var i in macros)
			this.macros[i] = macros[i];
}

ShaderQuery.prototype.clear = function()
{
	this.macros = {};
	this.hooks = {};
}

ShaderQuery.prototype.add = function( query )
{
	if(!query)
		return;

	//add macros
	for(var i in query.macros )
		this.macros[i] = query.macros[i];

	//add hooks
}

ShaderQuery.prototype.setMacro = function( name, value )
{
	this.macros[name] = name || "";
}

ShaderQuery.prototype.resolve = function()
{
	return LS.ShadersManager.query(this);
}

//ShaderQuery.prototype.addHook = function

LS.ShaderQuery = ShaderQuery;


//work in progress
//shaders should 

function ShaderPart()
{
	this.uid = 0// generate uid?

	this.imports = null; //snippets to import

	this.vertex_uniforms = null; //string like  uniform float u_data@;
	this.vertex_code = null; //string

	this.fragment_uniforms = null; //string like  uniform float u_data@;
	this.fragment_code = null; //string
}

LS.ShaderPart = ShaderPart;

//this module is in charge of rendering basic objects like lines, points, and primitives
//it works over litegl (no need of scene)
//carefull, it is very slow

/**
* LS.Draw allows to render basic primitives, similar to the OpenGL Fixed pipeline.
* It reuses local meshes when possible to avoid fragmenting the VRAM.
* @class Draw
* @constructor
*/

var Draw = {
	ready: false,
	images: {},
	image_last_id: 1,

	onRequestFrame: null,
	reset_stack_on_reset: true,

	/**
	* Sets up everything (prepare meshes, shaders, and so)
	* @method init
	*/
	init: function()
	{
		if(this.ready)
			return;
		if(!gl)
			return;

		this.color = new Float32Array(4);
		this.color[3] = 1;
		this.mvp_matrix = mat4.create();
		this.temp_matrix = mat4.create();
		this.point_size = 2;

		this.stack = new Float32Array(16 * 32); //stack max size
		this.model_matrix = new Float32Array(this.stack.buffer,0,16);
		mat4.identity( this.model_matrix );

		//matrices
		this.camera = null;
		this.camera_position = vec3.create();
		this.view_matrix = mat4.create();
		this.projection_matrix = mat4.create();
		this.viewprojection_matrix = mat4.create();

		this.camera_stack = []; //not used yet

		//Meshes
		var vertices = [[-1,1,0],[1,1,0],[1,-1,0],[-1,-1,0]];
		var coords = [[0,1],[1,1],[1,0],[0,0]];
		this.quad_mesh = GL.Mesh.load({vertices:vertices, coords: coords});

		var vertex_shader = '\
			precision mediump float;\n\
			attribute vec3 a_vertex;\n\
			#ifdef USE_COLOR\n\
				attribute vec4 a_color;\n\
				varying vec4 v_color;\n\
			#endif\n\
			#ifdef USE_TEXTURE\n\
				attribute vec2 a_coord;\n\
				varying vec2 v_coord;\n\
			#endif\n\
			#ifdef USE_SIZE\n\
				attribute float a_extra;\n\
			#endif\n\
			uniform mat4 u_mvp;\n\
			uniform float u_point_size;\n\
			void main() {\n\
				gl_PointSize = u_point_size;\n\
				#ifdef USE_SIZE\n\
					gl_PointSize = a_extra;\n\
				#endif\n\
				#ifdef USE_TEXTURE\n\
					v_coord = a_coord;\n\
				#endif\n\
				#ifdef USE_COLOR\n\
					v_color = a_color;\n\
				#endif\n\
				gl_Position = u_mvp * vec4(a_vertex,1.0);\n\
			}\
			';

		var pixel_shader = '\
			precision mediump float;\n\
			uniform vec4 u_color;\n\
			#ifdef USE_COLOR\n\
				varying vec4 v_color;\n\
			#endif\n\
			#ifdef USE_TEXTURE\n\
				varying vec2 v_coord;\n\
				uniform sampler2D u_texture;\n\
			#endif\n\
			void main() {\n\
				vec4 color = u_color;\n\
				#ifdef USE_TEXTURE\n\
				  color *= texture2D(u_texture, v_coord);\n\
				  if(color.a < 0.1)\n\
					discard;\n\
			    #endif\n\
				#ifdef USE_POINTS\n\
				    float dist = length( gl_PointCoord.xy - vec2(0.5) );\n\
					if( dist > 0.45 )\n\
						discard;\n\
			    #endif\n\
				#ifdef USE_COLOR\n\
					color *= v_color;\n\
				#endif\n\
				gl_FragColor = color;\n\
			}\
		';

		//create shaders
		this.shader = new Shader( vertex_shader, pixel_shader );

		this.shader_color = new Shader(vertex_shader,pixel_shader,{"USE_COLOR":""});
		this.shader_texture = new Shader(vertex_shader,pixel_shader,{"USE_TEXTURE":""});
		this.shader_points = new Shader(vertex_shader,pixel_shader,{"USE_POINTS":""});
		this.shader_points_color = new Shader(vertex_shader,pixel_shader,{"USE_COLOR":"","USE_POINTS":""});
		this.shader_points_color_size = new Shader(vertex_shader,pixel_shader,{"USE_COLOR":"","USE_SIZE":"","USE_POINTS":""});


		this.shader_image = new Shader('\
			precision mediump float;\n\
			attribute vec3 a_vertex;\n\
			uniform mat4 u_mvp;\n\
			uniform float u_point_size;\n\
			void main() {\n\
				gl_PointSize = u_point_size;\n\
				gl_Position = u_mvp * vec4(a_vertex,1.0);\n\
			}\
			','\
			precision mediump float;\n\
			uniform vec4 u_color;\n\
			uniform sampler2D u_texture;\n\
			void main() {\n\
			  vec4 tex = texture2D(u_texture, vec2(gl_PointCoord.x,1.0 - gl_PointCoord.y) );\n\
			  if(tex.a < 0.1)\n\
				discard;\n\
			  gl_FragColor = u_color * tex;\n\
			}\
		');



		this.shader_points_color_texture_size = new Shader('\
			precision mediump float;\n\
			attribute vec3 a_vertex;\n\
			attribute vec4 a_color;\n\
			attribute float a_extra;\n\
			uniform mat4 u_mvp;\n\
			uniform float u_point_size;\n\
			varying vec4 v_color;\n\
			void main() {\n\
				v_color = a_color;\n\
				gl_PointSize = u_point_size * a_extra;\n\
				gl_Position = u_mvp * vec4(a_vertex,1.0);\n\
			}\
			','\
			precision mediump float;\n\
			uniform vec4 u_color;\n\
			varying vec4 v_color;\n\
			uniform sampler2D u_texture;\n\
			void main() {\n\
			  vec4 tex = texture2D(u_texture, vec2(gl_PointCoord.x,1.0 - gl_PointCoord.y) );\n\
			  if(tex.a < 0.1)\n\
				discard;\n\
			  vec4 color = u_color * v_color * tex;\n\
			  gl_FragColor = color;\n\
			}\
		');

		//create shaders
		this.shader_phong = new Shader('\
			precision mediump float;\n\
			attribute vec3 a_vertex;\n\
			attribute vec3 a_normal;\n\
			varying vec3 v_pos;\n\
			varying vec3 v_normal;\n\
			uniform mat4 u_model;\n\
			uniform mat4 u_mvp;\n\
			void main() {\n\
				v_pos = (u_model * vec4(a_vertex,1.0)).xyz;\n\
				v_normal = (u_model * vec4(a_vertex + a_normal,1.0)).xyz - v_pos;\n\
				gl_Position = u_mvp * vec4(a_vertex,1.0);\n\
			}\
			','\
			precision mediump float;\n\
			uniform vec3 u_ambient_color;\n\
			uniform vec3 u_light_color;\n\
			uniform vec3 u_light_dir;\n\
			uniform vec4 u_color;\n\
			varying vec3 v_pos;\n\
			varying vec3 v_normal;\n\
			void main() {\n\
				vec3 N = normalize(v_normal);\n\
				float NdotL = max(0.0, dot(N,u_light_dir));\n\
				gl_FragColor = u_color * vec4(u_ambient_color + u_light_color * NdotL, 1.0);\n\
			}\
		');

		this.shader_phong.uniforms({u_ambient_color:[0.1,0.1,0.1], u_light_color:[0.8,0.8,0.8], u_light_dir: [0,1,0] });

		//create shaders
		this.shader_depth = new Shader('\
			precision mediump float;\n\
			attribute vec3 a_vertex;\n\
			varying vec4 v_pos;\n\
			uniform mat4 u_model;\n\
			uniform mat4 u_mvp;\n\
			void main() {\n\
				v_pos = u_model * vec4(a_vertex,1.0);\n\
				gl_Position = u_mvp * vec4(a_vertex,1.0);\n\
			}\
			','\
			precision mediump float;\n\
			varying vec4 v_pos;\n\
			\n\
			vec4 PackDepth32(float depth)\n\
			{\n\
				const vec4 bitSh  = vec4(   256*256*256, 256*256,   256,         1);\n\
				const vec4 bitMsk = vec4(   0,      1.0/256.0,    1.0/256.0,    1.0/256.0);\n\
				vec4 comp;\n\
				comp	= depth * bitSh;\n\
				comp	= fract(comp);\n\
				comp	-= comp.xxyz * bitMsk;\n\
				return comp;\n\
			}\n\
			void main() {\n\
				float depth = (v_pos.z / v_pos.w) * 0.5 + 0.5;\n\
				gl_FragColor = PackDepth32(depth);\n\
			}\
		');

		this.ready = true;
	},

	/**
	* A helper to create shaders when you only want to specify some basic shading
	* @method createSurfaceShader
	* @params {string} surface_function GLSL code like: "vec4 surface_function( vec3 pos, vec3 normal, vec2 coord ) { return vec4(1.0); } ";
	* @params {object} macros [optional] object containing the macros and value
	* @params {object} uniforms [optional] object with name and type
	* @return {GL.Shader} the resulting shader
	*/
	createSurfaceShader: function( surface_function, uniforms, macros )
	{
		//"vec4 surface_function( vec3 pos, vec3 normal, vec2 coord ) { return vec4(1.0); } ";

		if( surface_function.indexOf("surface_function") == -1 )
			surface_function = "vec4 surface_function( vec3 pos, vec3 normal, vec2 coord ) { " + surface_function + "\n } ";

		if(uniforms)
		{
			if (uniforms.constructor === String)
				surface_function = uniforms + ";\n" + surface_function;
			else
				for(var i in uniforms)
					surface_function += "uniform " + uniforms[i] + " " + i + ";\n";
		}

		var vertex_shader = "\
			precision mediump float;\n\
			attribute vec3 a_vertex;\n\
			attribute vec3 a_normal;\n\
			attribute vec2 a_coord;\n\
			varying vec2 v_coord;\n\
			varying vec3 v_pos;\n\
			varying vec3 v_normal;\n\
			uniform mat4 u_mvp;\n\
			uniform mat4 u_model;\n\
			void main() {\n\
				v_coord = a_coord;\n\
				v_pos = (u_model * vec4(a_vertex,1.0)).xyz;\n\
				v_normal = (u_model * vec4(a_normal,0.0)).xyz;\n\
				gl_Position = u_mvp * vec4(a_vertex,1.0);\n\
			}\
			";

		var pixel_shader = "\
			precision mediump float;\n\
			varying vec2 v_coord;\n\
			varying vec3 v_pos;\n\
			varying vec3 v_normal;\n\
			uniform vec4 u_color;\n\
			uniform vec3 u_camera_position;\n\
			uniform sampler2D u_texture;\n\
			"+ surface_function +"\n\
			void main() {\n\
				gl_FragColor = surface_function(v_pos,v_normal,v_coord);\n\
			}\
		";	

		return new GL.Shader( vertex_shader, pixel_shader, macros );
	},

	/**
	* clears the stack
	* @method reset
	*/
	reset: function( reset_memory )
	{
		if(!this.ready)
			this.init();

		if( reset_memory )
			this.images = {}; //clear images

		if(this.reset_stack_on_reset)
		{
			this.model_matrix = new Float32Array(this.stack.buffer,0,16);
			mat4.identity( this.model_matrix );
		}
	},

	/**
	* Sets the color used to paint primitives
	* @method setColor
	* @params {vec3|vec4} color
	*/
	setColor: function(color)
	{
		for(var i = 0; i < color.length; i++)
			this.color[i] = color[i];
	},

	/**
	* Sets the alpha used to paint primitives
	* @method setAlpha
	* @params {number} alpha
	*/
	setAlpha: function(alpha)
	{
		this.color[3] = alpha;
	},

	/**
	* Sets the point size
	* @method setPointSize
	* @params {number} v
	*/
	setPointSize: function(v)
	{
		this.point_size = v;
	},

	/**
	* Sets the camera to use during the rendering, this is already done by LS.Renderer
	* @method setCamera
	* @params {LS.Camera} camera
	*/
	setCamera: function( camera )
	{
		this.camera = camera;
		camera.updateMatrices();
		vec3.copy( this.camera_position, camera.getEye() );	
		mat4.copy( this.view_matrix, camera._view_matrix );
		mat4.copy( this.projection_matrix, camera._projection_matrix );
		mat4.copy( this.viewprojection_matrix, camera._viewprojection_matrix );
	},

	/**
	* Specifies the camera position (used to compute point size)
	* @method setCameraPosition
	* @params {vec3} center
	*/
	setCameraPosition: function(center)
	{
		vec3.copy( this.camera_position, center);
	},

	pushCamera: function()
	{
		this.camera_stack.push( mat4.create( this.viewprojection_matrix ) );
	},

	popCamera: function()
	{
		if(this.camera_stack.length == 0)
			throw("too many pops");
		this.viewprojection_matrix.set( this.camera_stack.pop() );
	},

	/**
	* Specifies the camera view and projection matrices
	* @method setViewProjectionMatrix
	* @params {mat4} view
	* @params {mat4} projection
	* @params {mat4} vp viewprojection matrix [optional]
	*/
	setViewProjectionMatrix: function(view, projection, vp)
	{
		mat4.copy( this.view_matrix, view);
		mat4.copy( this.projection_matrix, projection);
		if(vp)
			mat4.copy( this.viewprojection_matrix, vp);
		else
			mat4.multiply( this.viewprojection_matrix, view, vp);
	},

	/**
	* Specifies the transformation matrix to apply to the mesh
	* @method setMatrix
	* @params {mat4} matrix
	*/
	setMatrix: function(matrix)
	{
		mat4.copy(this.model_matrix, matrix);
	},

	/**
	* Multiplies the current matrix by a given one
	* @method multMatrix
	* @params {mat4} matrix
	*/
	multMatrix: function(matrix)
	{
		mat4.multiply(this.model_matrix, matrix, this.model_matrix);
	},

	/**
	* Render lines given a set of points
	* @method renderLines
	* @params {Float32Array|Array} points
	* @params {Float32Array|Array} colors [optional]
	* @params {bool} strip [optional] if the lines are a line strip (one consecutive line)
	*/
	renderLines: function(lines, colors, strip)
	{
		if(!lines || !lines.length) return;
		var vertices = null;

		vertices = lines.constructor == Float32Array ? lines : this.linearize(lines);
		if(colors)
			colors = colors.constructor == Float32Array ? colors : this.linearize(colors);
		if(colors && (colors.length/4) != (vertices.length/3))
			colors = null;

		var mesh = this.toGlobalMesh({vertices: vertices, colors: colors});
		return this.renderMesh(mesh, strip ? gl.LINE_STRIP : gl.LINES, colors ? this.shader_color : this.shader, undefined, 0, vertices.length / 3 );
	},

	/**
	* Render points given a set of positions (and colors)
	* @method renderPoints
	* @params {Float32Array|Array} points
	* @params {Float32Array|Array} colors [optional]
	* @params {GL.Shader} shader [optional]
	*/
	renderPoints: function(points, colors, shader)
	{
		if(!points || !points.length) return;
		var vertices = null;

		if(points.constructor == Float32Array)
			vertices = points;
		else if(points[0].length) //array of arrays
			vertices = this.linearize(points);
		else
			vertices = new Float32Array(points);

		if(colors && colors.constructor != Float32Array)
		{
			if(colors.constructor === Array && colors[0].constructor === Number)
				colors = new Float32Array( colors );
			else
				colors = this.linearize(colors);
		}

		var mesh = this.toGlobalMesh({vertices: vertices, colors: colors});
		if(!shader)
			shader = colors ? this.shader_color : this.shader;

		return this.renderMesh(mesh, gl.POINTS, shader, undefined, 0, vertices.length / 3 );
	},

	/**
	* Render round points given a set of positions (and colors)
	* @method renderRoundPoints
	* @params {Float32Array|Array} points
	* @params {Float32Array|Array} colors [optional]
	* @params {GL.Shader} shader [optional]
	*/
	renderRoundPoints: function(points, colors, shader)
	{
		if(!points || !points.length)
			return;

		var vertices = null;

		if(points.constructor == Float32Array)
			vertices = points;
		else if(points[0].length) //array of arrays
			vertices = this.linearize(points);
		else
			vertices = new Float32Array(points);

		if(colors)
			colors = colors.constructor == Float32Array ? colors : this.linearize(colors);

		var mesh = this.toGlobalMesh({vertices: vertices, colors: colors});
		if(!shader)
			shader = colors ? this.shader_points_color : this.shader_points;
		return this.renderMesh( mesh, gl.POINTS, shader, undefined, 0, vertices.length / 3 );
	},

	/**
	* Render points with color, size, and texture binded in 0
	* @method renderPointsWithSize
	* @params {Float32Array|Array} points
	* @params {Float32Array|Array} colors [optional]
	* @params {Float32Array|Array} sizes [optional]
	* @params {GL.Texture} texture [optional]
	* @params {GL.Shader} shader [optional]
	*/
	renderPointsWithSize: function(points, colors, sizes, texture, shader)
	{
		if(!points || !points.length) return;
		var vertices = null;

		if(points.constructor == Float32Array)
			vertices = points;
		else if(points[0].length) //array of arrays
			vertices = this.linearize(points);
		else
			vertices = new Float32Array(points);

		if(!colors)
			throw("colors required in Draw.renderPointsWithSize");
		colors = colors.constructor == Float32Array ? colors : this.linearize(colors);
		if(!sizes)
			throw("sizes required in Draw.renderPointsWithSize");
		sizes = sizes.constructor == Float32Array ? sizes : this.linearize(sizes);

		var mesh = this.toGlobalMesh({vertices: vertices, colors: colors, extra: sizes});
		shader = shader || (texture ? this.shader_points_color_texture_size : this.shader_points_color_size);
		
		return this.renderMesh(mesh, gl.POINTS, shader, undefined, 0, vertices.length / 3 );
	},

	createRectangleMesh: function(width, height, in_z, use_global)
	{
		var vertices = new Float32Array(4 * 3);
		if(in_z)
			vertices.set([-width*0.5,0,height*0.5, width*0.5,0,height*0.5, width*0.5,0,-height*0.5, -width*0.5,0,-height*0.5]);
		else
			vertices.set([-width*0.5,height*0.5,0, width*0.5,height*0.5,0, width*0.5,-height*0.5,0, -width*0.5,-height*0.5,0]);

		if(use_global)
			return this.toGlobalMesh( {vertices: vertices} );

		return GL.Mesh.load({vertices: vertices});
	},

	/**
	* Render points with color, size, and texture binded in 0
	* @method renderRectangle
	* @params {number} width
	* @params {number} height
	* @params {boolean} in_z [optional] if the plane is aligned with the z plane
	*/
	renderRectangle: function(width, height, in_z)
	{
		var mesh = this.createRectangleMesh(width, height, in_z, true);
		return this.renderMesh( mesh, gl.LINE_LOOP, undefined, undefined, 0, this._global_mesh_last_size );
	},

	createCircleMesh: function(radius, segments, in_z, use_global)
	{
		segments = segments || 32;
		var axis = [0,1,0];
		var num_segments = segments || 100;
		var R = quat.create();
		var temp = vec3.create();
		var vertices = new Float32Array(num_segments * 3);

		var offset =  2 * Math.PI / num_segments;

		for(var i = 0; i < num_segments; i++)
		{
			temp[0] = Math.sin(offset * i) * radius;
			if(in_z)
			{
				temp[1] = 0;
				temp[2] = Math.cos(offset * i) * radius;
			}
			else
			{
				temp[2] = 0;
				temp[1] = Math.cos(offset * i) * radius;
			}

			vertices.set(temp, i*3);
		}

		if(use_global)
			return this.toGlobalMesh({vertices: vertices});

		return GL.Mesh.load({vertices: vertices});
	},

	/**
	* Renders a circle 
	* @method renderCircle
	* @params {number} radius
	* @params {number} segments
	* @params {boolean} in_z [optional] if the circle is aligned with the z plane
	* @params {boolean} filled [optional] renders the interior
	*/
	renderCircle: function(radius, segments, in_z, filled)
	{
		var mesh = this.createCircleMesh(radius, segments, in_z, true);
		return this.renderMesh(mesh, filled ? gl.TRIANGLE_FAN : gl.LINE_LOOP, undefined, undefined, 0, this._global_mesh_last_size );
	},

	/**
	* Render a filled circle
	* @method renderSolidCircle
	* @params {number} radius
	* @params {number} segments
	* @params {boolean} in_z [optional] if the circle is aligned with the z plane
	*/
	renderSolidCircle: function(radius, segments, in_z)
	{
		return this.renderCircle(radius, segments, in_z, true);
	},

	createSphereMesh: function(radius, segments, use_global )
	{
		var axis = [0,1,0];
		segments = segments || 100;
		var R = quat.create();
		var temp = vec3.create();
		var vertices = new Float32Array( segments * 2 * 3 * 3); 

		var delta = 1.0 / segments * Math.PI * 2;

		for(var i = 0; i < segments; i++)
		{
			temp.set([ Math.sin( i * delta) * radius, Math.cos( i * delta) * radius, 0]);
			vertices.set(temp, i*18);
			temp.set([Math.sin( (i+1) * delta) * radius, Math.cos( (i+1) * delta) * radius, 0]);
			vertices.set(temp, i*18 + 3);

			temp.set([ Math.sin( i * delta) * radius, 0, Math.cos( i * delta) * radius ]);
			vertices.set(temp, i*18 + 6);
			temp.set([Math.sin( (i+1) * delta) * radius, 0, Math.cos( (i+1) * delta) * radius ]);
			vertices.set(temp, i*18 + 9);

			temp.set([ 0, Math.sin( i * delta) * radius, Math.cos( i * delta) * radius ]);
			vertices.set(temp, i*18 + 12);
			temp.set([ 0, Math.sin( (i+1) * delta) * radius, Math.cos( (i+1) * delta) * radius ]);
			vertices.set(temp, i*18 + 15);
		}

		if(use_global)
			return this.toGlobalMesh({vertices: vertices});
		
		return GL.Mesh.load({vertices: vertices});
	},

	/**
	* Renders three circles to form a simple spherical shape
	* @method renderWireSphere
	* @params {number} radius
	* @params {number} segments
	*/
	renderWireSphere: function(radius, segments)
	{
		var mesh = this.createSphereMesh( radius, segments, true );
		return this.renderMesh( mesh, gl.LINES, undefined, undefined, 0, this._global_mesh_last_size );
	},

	createWireBoxMesh: function( sizex, sizey, sizez, use_global )
	{
		sizex = sizex*0.5;
		sizey = sizey*0.5;
		sizez = sizez*0.5;
		var vertices = new Float32Array([-sizex,sizey,sizez , -sizex,sizey,-sizez, sizex,sizey,-sizez, sizex,sizey,sizez,
						-sizex,-sizey,sizez, -sizex,-sizey,-sizez, sizex,-sizey,-sizez, sizex,-sizey,sizez]);
		var triangles = new Uint16Array([0,1, 0,4, 0,3, 1,2, 1,5, 2,3, 2,6, 3,7, 4,5, 4,7, 6,7, 5,6   ]);

		if(use_global)
			return this.toGlobalMesh( {vertices: vertices}, triangles );

		return GL.Mesh.load({vertices: vertices, lines:triangles });
	},

	/**
	* Renders a wire box (box made of lines, not filled)
	* @method renderWireBox
	* @params {number} sizex
	* @params {number} sizey
	* @params {number} sizez
	*/
	renderWireBox: function(sizex,sizey,sizez)
	{
		var mesh = this.createWireBoxMesh(sizex,sizey,sizez, true);
		return this.renderMesh( mesh, gl.LINES, undefined, "indices", 0, this._global_mesh_last_size );
	},

	createSolidBoxMesh: function( sizex,sizey,sizez, use_global)
	{
		sizex = sizex*0.5;
		sizey = sizey*0.5;
		sizez = sizez*0.5;
		//var vertices = [[-sizex,sizey,-sizez],[-sizex,-sizey,+sizez],[-sizex,sizey,sizez],[-sizex,sizey,-sizez],[-sizex,-sizey,-sizez],[-sizex,-sizey,+sizez],[sizex,sizey,-sizez],[sizex,sizey,sizez],[sizex,-sizey,+sizez],[sizex,sizey,-sizez],[sizex,-sizey,+sizez],[sizex,-sizey,-sizez],[-sizex,sizey,sizez],[sizex,-sizey,sizez],[sizex,sizey,sizez],[-sizex,sizey,sizez],[-sizex,-sizey,sizez],[sizex,-sizey,sizez],[-sizex,sizey,-sizez],[sizex,sizey,-sizez],[sizex,-sizey,-sizez],[-sizex,sizey,-sizez],[sizex,-sizey,-sizez],[-sizex,-sizey,-sizez],[-sizex,sizey,-sizez],[sizex,sizey,sizez],[sizex,sizey,-sizez],[-sizex,sizey,-sizez],[-sizex,sizey,sizez],[sizex,sizey,sizez],[-sizex,-sizey,-sizez],[sizex,-sizey,-sizez],[sizex,-sizey,sizez],[-sizex,-sizey,-sizez],[sizex,-sizey,sizez],[-sizex,-sizey,sizez]];
		var vertices = [-sizex,sizey,-sizez,-sizex,-sizey,+sizez,-sizex,sizey,sizez,-sizex,sizey,-sizez,-sizex,-sizey,-sizez,-sizex,-sizey,+sizez,sizex,sizey,-sizez,sizex,sizey,sizez,sizex,-sizey,+sizez,sizex,sizey,-sizez,sizex,-sizey,+sizez,sizex,-sizey,-sizez,-sizex,sizey,sizez,sizex,-sizey,sizez,sizex,sizey,sizez,-sizex,sizey,sizez,-sizex,-sizey,sizez,sizex,-sizey,sizez,-sizex,sizey,-sizez,sizex,sizey,-sizez,sizex,-sizey,-sizez,-sizex,sizey,-sizez,sizex,-sizey,-sizez,-sizex,-sizey,-sizez,-sizex,sizey,-sizez,sizex,sizey,sizez,sizex,sizey,-sizez,-sizex,sizey,-sizez,-sizex,sizey,sizez,sizex,sizey,sizez,-sizex,-sizey,-sizez,sizex,-sizey,-sizez,sizex,-sizey,sizez,-sizex,-sizey,-sizez,sizex,-sizey,sizez,-sizex,-sizey,sizez];
		if(use_global)
			return this.toGlobalMesh( {vertices: vertices} );

		return GL.Mesh.load({vertices: vertices });
	},

	/**
	* Renders a solid box 
	* @method renderSolidBox
	* @params {number} sizex
	* @params {number} sizey
	* @params {number} sizez
	*/
	renderSolidBox: function(sizex,sizey,sizez)
	{
		var mesh = this.createSolidBoxMesh(sizex,sizey,sizez, true);
		return this.renderMesh( mesh, gl.TRIANGLES, undefined, undefined, 0, this._global_mesh_last_size );
	},

	renderWireCube: function(size)
	{
		return this.renderWireBox(size,size,size);
	},

	renderSolidCube: function(size)
	{
		return this.renderSolidCube(size,size,size);
	},

	renderPlane: function(position, size, texture, shader)
	{
		this.push();
		this.translate(position);
		this.scale( size[0], size[1], 1 );
		if(texture)
			texture.bind(0);

		if(!shader && texture)
			shader = this.shader_texture;

		this.renderMesh(this.quad_mesh, gl.TRIANGLE_FAN, shader );

		if(texture)
			texture.unbind(0);
		
		this.pop();
	},	

	createGridMesh: function(dist,num)
	{
		dist = dist || 20;
		num = num || 10;
		var vertices = new Float32Array( (num*2+1) * 4 * 3);
		var pos = 0;
		for(var i = -num; i <= num; i++)
		{
			vertices.set( [i*dist,0,dist*num], pos);
			vertices.set( [i*dist,0,-dist*num],pos+3);
			vertices.set( [dist*num,0,i*dist], pos+6);
			vertices.set( [-dist*num,0,i*dist],pos+9);
			pos += 3*4;
		}
		return GL.Mesh.load({vertices: vertices});
	},

	renderGrid: function(dist,num)
	{
		var mesh = this.createGridMesh(dist,num);
		return this.renderMesh(mesh, gl.LINES);
	},

	createConeMesh: function(radius, height, segments, in_z, use_global )
	{
		var axis = [0,1,0];
		segments = segments || 100;
		var R = quat.create();
		var temp = vec3.create();
		var vertices = new Float32Array( (segments+2) * 3);
		vertices.set(in_z ? [0,0,height] : [0,height,0], 0);

		for(var i = 0; i <= segments; i++)
		{
			quat.setAxisAngle(R,axis, 2 * Math.PI * (i/segments) );
			vec3.transformQuat(temp, [0,0,radius], R );
			if(in_z)
				vec3.set(temp, temp[0],temp[2],temp[1] );
			vertices.set(temp, i*3+3);
		}

		if(use_global)
			return this.toGlobalMesh( {vertices: vertices} );

		return GL.Mesh.load({vertices: vertices});
	},

	/**
	* Renders a cone 
	* @method renderCone
	* @params {number} radius
	* @params {number} height
	* @params {number} segments
	* @params {boolean} in_z aligned with z axis
	*/
	renderCone: function(radius, height, segments, in_z)
	{
		var mesh = this.createConeMesh(radius, height, segments, in_z, true);
		return this.renderMesh(mesh, gl.TRIANGLE_FAN, undefined, undefined, 0, this._global_mesh_last_size );
	},

	createCylinderMesh: function( radius, height, segments, in_z, use_global )
	{
		var axis = [0,1,0];
		segments = segments || 100;
		var R = quat.create();
		var temp = vec3.create();
		var vertices = new Float32Array( (segments+1) * 3 * 2);

		for(var i = 0; i <= segments; i++)
		{
			quat.setAxisAngle(R, axis, 2 * Math.PI * (i/segments) );
			vec3.transformQuat(temp, [0,0,radius], R );
			vertices.set(temp, i*3*2+3);
			temp[1] = height;
			vertices.set(temp, i*3*2);
		}

		if(use_global)
			return this.toGlobalMesh( {vertices: vertices} );

		return GL.Mesh.load({vertices: vertices});
	},

	/**
	* Renders a cylinder
	* @method renderCylinder
	* @params {number} radius
	* @params {number} height
	* @params {number} segments
	* @params {boolean} in_z aligned with z axis
	*/
	renderCylinder: function(radius, height, segments, in_z)
	{
		var mesh = this.createCylinderMesh(radius, height, segments, in_z, true);
		return this.renderMesh( mesh, gl.TRIANGLE_STRIP, undefined, undefined, 0, this._global_mesh_last_size );
	},

	/**
	* Renders an image
	* @method renderImage
	* @params {vec3} position
	* @params {Image|Texture|String} image from an URL, or a texture
	* @params {number} size [optional=10]
	* @params {boolean} fixed_size [optional=false] (camera distance do not affect size)
	*/
	renderImage: function(position, image, size, fixed_size )
	{
		size = size || 10;
		var texture = null;

		if(typeof(image) == "string")
		{
			texture = this.images[image];
			if(texture == null)
			{
				Draw.images[image] = 1; //loading
				var img = new Image();
				img.src = image;
				img.onload = function()
				{
					var texture = GL.Texture.fromImage(this);
					Draw.images[image] = texture;
					if(Draw.onRequestFrame)
						Draw.onRequestFrame();
					return;
				}	
				return;
			}
			else if(texture == 1)
				return; //loading
		}
		else if(image.constructor == Image)
		{
			if(!image.texture)
				image.texture = GL.Texture.fromImage( this );
			texture = image.texture;
		}
		else if(image.constructor == Texture)
			texture = image;

		if(!texture)
			return;

		if(fixed_size)
		{
			this.setPointSize( size );
			texture.bind(0);
			this.renderPoints( position, null, this.shader_image );
		}
		else
		{
			this.push();
			//this.lookAt(position, this.camera_position,[0,1,0]);
			this.billboard(position);
			this.scale(size,size,size);
			texture.bind(0);
			this.renderMesh(this.quad_mesh, gl.TRIANGLE_FAN, this.shader_texture );
			this.pop();
		}
	},

	/**
	* Renders a given mesh applyting the stack transformations
	* @method renderMesh
	* @params {GL.Mesh} mesh
	* @params {enum} primitive [optional=gl.TRIANGLES] GL.TRIANGLES, gl.LINES, gl.POINTS, ...
	* @params {string} indices [optional="triangles"] the name of the buffer in the mesh with the indices
	* @params {number} range_start [optional] in case of rendering a range, the start primitive
	* @params {number} range_length [optional] in case of rendering a range, the number of primitives
	*/
	renderMesh: function( mesh, primitive, shader, indices, range_start, range_length )
	{
		if(!this.ready) throw ("Draw.js not initialized, call Draw.init()");
		if(!shader)
		{
			if(mesh === this._global_mesh && this._global_mesh_ignore_colors )
				shader = this.shader;
			else
				shader = mesh.vertexBuffers["colors"] ? this.shader_color : this.shader;
		}

		mat4.multiply(this.mvp_matrix, this.viewprojection_matrix, this.model_matrix );

		shader.uniforms({
				u_model: this.model_matrix,
				u_mvp: this.mvp_matrix,
				u_color: this.color,
				u_camera_position: this.camera_position,
				u_point_size: this.point_size,
				u_texture: 0
		});
				
		if( range_start === undefined )
			shader.draw(mesh, primitive === undefined ? gl.TRIANGLES : primitive, indices );
		else
			shader.drawRange(mesh, primitive === undefined ? gl.TRIANGLES : primitive, range_start, range_length, indices );

		//used for repeating render 
		this._last_mesh = mesh;
		this._last_primitive = primitive;
		this._last_shader = shader;
		this._last_indices = indices;
		this._last_range_start = range_start;
		this._last_range_length = range_length;

		this.last_mesh = mesh;
		return mesh;
	},

	//used in some special cases
	repeatLastRender: function()
	{
		this.renderMesh( this._last_mesh, this._last_primitive, this._last_shader, this._last_indices, this._last_range_start, this._last_range_length );
	},

	/**
	* Renders a text in the current matrix position
	* @method renderText
	* @params {string} text
	*/
	renderText: function( text )
	{
		if(!Draw.font_atlas)
			this.createFontAtlas();
		var atlas = this.font_atlas;
		var l = text.length;
		var char_size = atlas.atlas.char_size;
		var i_char_size = 1 / atlas.atlas.char_size;
		var spacing = atlas.atlas.spacing;

		var num_valid_chars = 0;
		for(var i = 0; i < l; ++i)
			if(atlas.atlas[ text.charCodeAt(i) ] != null)
				num_valid_chars++;

		var vertices = new Float32Array( num_valid_chars * 6 * 3);
		var coords = new Float32Array( num_valid_chars * 6 * 2);

		var pos = 0;
		var x = 0, y = 0;
		for(var i = 0; i < l; ++i)
		{
			var c = atlas.atlas[ text.charCodeAt(i) ];
			if(!c)
			{
				if(text.charCodeAt(i) == 10)
				{
					x = 0;
					y -= char_size;
				}
				else
					x += char_size;
				continue;
			}

			vertices.set( [x, y, 0], pos*6*3);
			vertices.set( [x, y + char_size, 0], pos*6*3+3);
			vertices.set( [x + char_size, y + char_size, 0], pos*6*3+6);
			vertices.set( [x + char_size, y, 0], pos*6*3+9);
			vertices.set( [x, y, 0], pos*6*3+12);
			vertices.set( [x + char_size, y + char_size, 0], pos*6*3+15);

			coords.set( [c[0], c[1]], pos*6*2);
			coords.set( [c[0], c[3]], pos*6*2+2);
			coords.set( [c[2], c[3]], pos*6*2+4);
			coords.set( [c[2], c[1]], pos*6*2+6);
			coords.set( [c[0], c[1]], pos*6*2+8);
			coords.set( [c[2], c[3]], pos*6*2+10);

			x+= spacing;
			++pos;
		}
		var mesh = this.toGlobalMesh({vertices: vertices, coords: coords});
		atlas.bind(0);
		return this.renderMesh( mesh, gl.TRIANGLES, this.shader_texture, undefined, 0, vertices.length / 3 );
	},


	createFontAtlas: function()
	{
		var canvas = createCanvas(512,512);
		var fontsize = (canvas.width * 0.09)|0;
		var char_size = (canvas.width * 0.1)|0;

		//$("body").append(canvas);
		var ctx = canvas.getContext("2d");
		//ctx.fillRect(0,0,canvas.width,canvas.height);
		ctx.fillStyle = "white";
		ctx.font = fontsize + "px Courier New";
		ctx.textAlign = "center";
		var x = 0;
		var y = 0;
		var xoffset = 0.5, yoffset = fontsize * -0.3;
		var atlas = {char_size: char_size, spacing: char_size * 0.6};

		for(var i = 6; i < 100; i++)//valid characters
		{
			var character = String.fromCharCode(i+27);
			atlas[i+27] = [x/canvas.width, 1-(y+char_size)/canvas.height, (x+char_size)/canvas.width, 1-(y)/canvas.height];
			ctx.fillText(character,Math.floor(x+char_size*xoffset),Math.floor(y+char_size+yoffset),char_size);
			x += char_size;
			if((x + char_size) > canvas.width)
			{
				x = 0;
				y += char_size;
			}
		}

		this.font_atlas = GL.Texture.fromImage(canvas, {magFilter: gl.NEAREST, minFilter: gl.LINEAR} );
		this.font_atlas.atlas = atlas;
	},

	linearize: function(array)
	{
		var n = array[0].length;
		var result = new Float32Array(array.length * n);
		var l = array.length;
		for(var i = 0; i < l; ++i)
			result.set(array[i], i*n);
		return result;
	},

	/**
	* pushes the transform matrix into the stack to save the state
	* @method push
	*/
	push: function()
	{
		if(this.model_matrix.byteOffset >= (this.stack.byteLength - 16*4))
			throw("matrices stack overflow");

		var old = this.model_matrix;
		this.model_matrix = new Float32Array(this.stack.buffer,this.model_matrix.byteOffset + 16*4,16);
		mat4.copy(this.model_matrix, old);
	},

	/**
	* takes the matrix from the top position of the stack to restore the last saved state
	* @method push
	*/
	pop: function()
	{
		if(this.model_matrix.byteOffset == 0)
			throw("too many pops");
		this.model_matrix = new Float32Array(this.stack.buffer,this.model_matrix.byteOffset - 16*4,16);
	},

	/**
	* clears the transform matrix setting it to an identity
	* @method identity
	*/
	identity: function()
	{
		mat4.identity(this.model_matrix);
	},

	/**
	* changes the scale of the transform matrix. The parameters could be a vec3, a single number (then the scale is uniform in all axis) or three numbers
	* @method scale
	* @param {vec3|array|number} x could be an array of 3, one value (if no other values are specified then it is an uniform scaling)
	* @param {number} y
	* @param {number} z
	*/
	scale: function(x,y,z)
	{
		if(arguments.length == 3)
			mat4.scale(this.model_matrix,this.model_matrix,[x,y,z]);
		else if(x.length)//one argument: x is vec3
			mat4.scale(this.model_matrix,this.model_matrix,x);
		else //is number
			mat4.scale(this.model_matrix,this.model_matrix,[x,x,x]);
	},

	/**
	* applies a translation to the transform matrix
	* @method translate
	* @param {vec3|number} x could be an array of 3 or the x transform
	* @param {number} y
	* @param {number} z
	*/
	translate: function(x,y,z)
	{
		if(arguments.length == 3)
			mat4.translate(this.model_matrix,this.model_matrix,[x,y,z]);
		else  //one argument: x -> vec3
			mat4.translate(this.model_matrix,this.model_matrix,x);
	},

	/**
	* applies a translation to the transform matrix
	* @method rotate
	* @param {number} angle in degrees
	* @param {number|vec3} x could be the x component or the full axis
	* @param {number} y
	* @param {number} z
	*/
	rotate: function(angle, x,y,z)
	{
		if(arguments.length == 4)
			mat4.rotate(this.model_matrix, this.model_matrix, angle * DEG2RAD, [x,y,z]);
		else //two arguments: x -> vec3
			mat4.rotate(this.model_matrix, this.model_matrix, angle * DEG2RAD, x);
	},

	/**
	* moves an object to a given position and forces it to look to another direction
	* Warning: it doesnt changes the camera in any way, only the transform matrix
	* @method lookAt
	* @param {vec3} position
	* @param {vec3} target
	* @param {vec3} up
	*/
	lookAt: function(position, target, up)
	{
		mat4.lookAt( this.model_matrix, position, target, up );
		mat4.invert( this.model_matrix, this.model_matrix );
	},

	billboard: function(position)
	{
		mat4.invert(this.model_matrix, this.view_matrix);
		mat4.setTranslation(this.model_matrix, position);
	},

	fromTranslationFrontTop: function(position, front, top)
	{
		mat4.fromTranslationFrontTop(this.model_matrix, position, front, top);
	},

	/**
	* projects a point from 3D space to 2D space (multiply by MVP)
	* @method project
	* @param {vec3} position
	* @param {vec3} dest [optional]
	* @return {vec3} the point in screen space (in normalized coordinates)
	*/
	project: function( position, dest )
	{
		dest = dest || vec3.create();
		return mat4.multiplyVec3(dest, this.mvp_matrix, position);
	},

	getPhongShader: function( ambient_color, light_color, light_dir )
	{
		this.shader_phong.uniforms({ u_ambient_color: ambient_color, u_light_color: light_color, u_light_dir: light_dir });
		return this.shader_phong;
	},

	getDepthShader: function()
	{
		return this.shader_depth;
	},

	//reuses a global mesh to avoid fragmenting the VRAM 
	toGlobalMesh: function( buffers, indices )
	{
		if(!this._global_mesh)
		{
			//global mesh: to reuse memory and save fragmentation
			this._global_mesh_max_vertices = 1024;
			this._global_mesh = new GL.Mesh({
				vertices: new Float32Array(this._global_mesh_max_vertices * 3),
				normals: new Float32Array(this._global_mesh_max_vertices * 3),
				coords: new Float32Array(this._global_mesh_max_vertices * 2),
				colors: new Float32Array(this._global_mesh_max_vertices * 4),
				extra: new Float32Array(this._global_mesh_max_vertices * 1)
			},{
				indices: new Uint16Array(this._global_mesh_max_vertices * 3)
			}, { stream_type: gl.DYNAMIC_STREAM });
		}

		//take every stream and store it inside the mesh buffers
		for(var i in buffers)
		{
			var mesh_buffer = this._global_mesh.getBuffer( i );
			if(!mesh_buffer)
			{
				console.warn("Draw: global mesh lacks one buffer: " + i );
				continue;
			}

			var buffer_data = buffers[i];
			if(!buffer_data)
				continue;
			if(!buffer_data.buffer)
				buffer_data = new Float32Array( buffer_data ); //force typed arrays

			//some data would be lost here
			if(buffer_data.length > mesh_buffer.data.length)
			{
				console.warn("Draw: data is too big, resizing" );
				this.resizeGlobalMesh();
				mesh_buffer = this._global_mesh.getBuffer( i );
				buffer_data = buffer_data.subarray(0,mesh_buffer.data.length);
			}

			mesh_buffer.setData( buffer_data ); //set and upload
		}

		this._global_mesh_ignore_colors = !(buffers.colors);

		if(indices)
		{
			var mesh_buffer = this._global_mesh.getIndexBuffer("indices");			
			mesh_buffer.setData( indices );
			this._global_mesh_last_size = indices.length;
		}
		else
			this._global_mesh_last_size = buffers["vertices"].length / 3;
		return this._global_mesh;
	},

	resizeGlobalMesh: function()
	{
		if(!this._global_mesh)
			throw("No global mesh to resize");

		//global mesh: to reuse memory and save fragmentation
		this._global_mesh_max_vertices = this._global_mesh_max_vertices * 2;
		this._global_mesh.deleteBuffers();

		this._global_mesh = new GL.Mesh({
			vertices: new Float32Array(this._global_mesh_max_vertices * 3),
			normals: new Float32Array(this._global_mesh_max_vertices * 3),
			coords: new Float32Array(this._global_mesh_max_vertices * 2),
			colors: new Float32Array(this._global_mesh_max_vertices * 4),
			extra: new Float32Array(this._global_mesh_max_vertices * 1)
		},{
			indices: new Uint16Array(this._global_mesh_max_vertices * 3)
		}, { stream_type: gl.DYNAMIC_STREAM });
	}

};

if(typeof(LS) != "undefined")
	LS.Draw = Draw;

//Add some functions to the classes in LiteGL to fit better in the LiteScene engine

//when working with animations sometimes you want the bones to be referenced by node name and no node uid, because otherwise you cannot reuse
//the same animation with different characters in the same scene.
GL.Mesh.prototype.convertBonesToNames = function( root_node )
{
	if(!this.bones || !this.bones.length)
		return 0;

	var modified = false;

	//Rename the id to a relative name
	for(var i = 0; i < this.bones.length; ++i)
	{
		var bone = this.bones[i];
		var bone_name = bone[0];
		if( bone_name[0] != LS._uid_prefix)
			continue; //already using a name, not a uid
		var node = root_node ? root_node.findNode( bone_name ) : LS.GlobalScene.getNode( bone_name );
		if(!node)
		{
			console.warn("Bone node not found: " + bone_name );
			continue;
		}

		bone[0] = node.name;
		modified = true;
	}

	//flag it
	if(modified)
		LS.RM.resourceModified( this );
}

GL.Mesh.fromBinary = function( data_array )
{
	var o = null;
	if(data_array.constructor == ArrayBuffer )
		o = WBin.load( data_array );
	else
		o = data_array;

	var vertex_buffers = {};
	for(var i in o.vertex_buffers)
		vertex_buffers[ o.vertex_buffers[i] ] = o[ o.vertex_buffers[i] ];

	var index_buffers = {};
	for(var i in o.index_buffers)
		index_buffers[ o.index_buffers[i] ] = o[ o.index_buffers[i] ];

	var mesh = new GL.Mesh(vertex_buffers, index_buffers);
	mesh.info = o.info;
	mesh.bounding = o.bounding;
	if(o.bones)
	{
		mesh.bones = o.bones;
		//restore Float32array
		for(var i = 0; i < mesh.bones.length; ++i)
			mesh.bones[i][1] = mat4.clone(mesh.bones[i][1]);
		if(o.bind_matrix)
			mesh.bind_matrix = mat4.clone( o.bind_matrix );		
	}
	
	return mesh;
}

GL.Mesh.prototype.toBinary = function()
{
	if(!this.info)
		this.info = {};

	//clean data
	var o = {
		object_type: "Mesh",
		info: this.info,
		groups: this.groups
	};

	if(this.bones)
	{
		var bones = [];
		//convert to array
		for(var i = 0; i < this.bones.length; ++i)
			bones.push([ this.bones[i][0], mat4.toArray( this.bones[i][1] ) ]);
		o.bones = bones;
		if(this.bind_matrix)
			o.bind_matrix = this.bind_matrix;
	}

	//bounding box
	if(!this.bounding)	
		this.updateBounding();
	o.bounding = this.bounding;

	var vertex_buffers = [];
	var index_buffers = [];

	for(var i in this.vertexBuffers)
	{
		var stream = this.vertexBuffers[i];
		o[ stream.name ] = stream.data;
		vertex_buffers.push( stream.name );

		if(stream.name == "vertices")
			o.info.num_vertices = stream.data.length / 3;
	}

	for(var i in this.indexBuffers)
	{
		var stream = this.indexBuffers[i];
		o[i] = stream.data;
		index_buffers.push( i );
	}

	o.vertex_buffers = vertex_buffers;
	o.index_buffers = index_buffers;

	//create pack file
	var bin = WBin.create(o, "Mesh");

	return bin;
}




//Material class **************************
/* Warning: a material is not a component, because it can be shared by multiple nodes */

/**
* Material class contains all the info about how a mesh should be rendered, more in a highlevel format.
* Most of the info is Colors, factors and Textures but it can also specify a shader or some flags.
* Materials could be shared among different objects.
* @namespace LS
* @class Material
* @constructor
* @param {String} object to configure from
*/

function Material(o)
{
	this.name = "";
	this.uid = LS.generateUId("MAT-");
	this._dirty = true;

	//this.shader_name = null; //default shader
	this._color = new Float32Array([1.0,1.0,1.0,1.0]);
	this.createProperty("diffuse", new Float32Array([1.0,1.0,1.0]), "color" );
	this.shader_name = "global";
	this.blend_mode = LS.Blend.NORMAL;

	this.alpha_test = false;
	this.alpha_test_shadows = false;

	this._specular_data = vec2.fromValues( 0.1, 10.0 );

	//this.reflection_factor = 0.0;	

	//textures
	this.uvs_matrix = new Float32Array([1,0,0, 0,1,0, 0,0,1]);
	this.textures = {};

	this._query = new ShaderQuery();

	//properties with special storage (multiple vars shared among single properties)

	Object.defineProperty( this, 'color', {
		get: function() { return this._color.subarray(0,3); },
		set: function(v) { vec3.copy( this._color, v ); },
		enumerable: true
	});

	Object.defineProperty( this, 'opacity', {
		get: function() { return this._color[3]; },
		set: function(v) { this._color[3] = v; },
		enumerable: true
	});

	Object.defineProperty( this, 'specular_factor', {
		get: function() { return this._specular_data[0]; },
		set: function(v) { this._specular_data[0] = v; },
		enumerable: true
	});

	Object.defineProperty( this, 'specular_gloss', {
		get: function() { return this._specular_data[1]; },
		set: function(v) { this._specular_data[1] = v; },
		enumerable: true
	});

	if(o) 
		this.configure(o);
}

Material["@color"] = { type:"color" };
Material["@blend_mode"] = { type: "enum", values: LS.Blend };

Material.icon = "mini-icon-material.png";


//material info attributes, use this to avoid errors when settings the attributes of a material

/**
* Surface color
* @property color
* @type {vec3}
* @default [1,1,1]
*/
Material.COLOR = "color";
/**
* Opacity. It must be < 1 to enable alpha sorting. If it is <= 0 wont be visible.
* @property opacity
* @type {number}
* @default 1
*/
Material.OPACITY = "opacity";

/**
* Blend mode, it could be any of Blend options (NORMAL,ALPHA, ADD, SCREEN)
* @property blend_mode
* @type {String}
* @default Blend.NORMAL
*/
Material.BLEND_MODE = "blend_mode";

Material.SPECULAR_FACTOR = "specular_factor";
/**
* Specular glossiness: the glossines (exponent) of specular light
* @property specular_gloss
* @type {number}
* @default 10
*/
Material.SPECULAR_GLOSS = "specular_gloss";


Material.OPACITY_TEXTURE = "opacity";	//used for baked GI
Material.COLOR_TEXTURE = "color";	//material color
Material.AMBIENT_TEXTURE = "ambient";
Material.SPECULAR_TEXTURE = "specular"; //defines specular factor and glossiness per pixel
Material.EMISSIVE_TEXTURE = "emissive";
Material.ENVIRONMENT_TEXTURE = "environment";

Material.COORDS_UV0 = "0";
Material.COORDS_UV1 = "1";
Material.COORDS_UV_TRANSFORMED = "transformed";
Material.COORDS_SCREEN = "screen";					//project to screen space
Material.COORDS_SCREENCENTERED = "screen_centered";	//project to screen space and centers and corrects aspect
Material.COORDS_FLIPPED_SCREEN = "flipped_screen";	//used for realtime reflections
Material.COORDS_POLAR = "polar";					//use view vector as polar coordinates
Material.COORDS_POLAR_REFLECTED = "polar_reflected";//use reflected view vector as polar coordinates
Material.COORDS_POLAR_VERTEX = "polar_vertex";		//use normalized vertex as polar coordinates
Material.COORDS_WORLDXZ = "worldxz";
Material.COORDS_WORLDXY = "worldxy";
Material.COORDS_WORLDYZ = "worldyz";

Material.TEXTURE_COORDINATES = [ Material.COORDS_UV0, Material.COORDS_UV1, Material.COORDS_UV_TRANSFORMED, Material.COORDS_SCREEN, Material.COORDS_SCREENCENTERED, Material.COORDS_FLIPPED_SCREEN, Material.COORDS_POLAR, Material.COORDS_POLAR_REFLECTED, Material.COORDS_POLAR_VERTEX, Material.COORDS_WORLDXY, Material.COORDS_WORLDXZ, Material.COORDS_WORLDYZ ];
Material.DEFAULT_UVS = { "normal":Material.COORDS_UV0, "displacement":Material.COORDS_UV0, "environment": Material.COORDS_POLAR_REFLECTED, "irradiance" : Material.COORDS_POLAR };

Material.available_shaders = ["default","global","lowglobal","phong_texture","flat","normal","phong","flat_texture","cell_outline"];
Material.texture_channels = [ Material.COLOR_TEXTURE, Material.OPACITY_TEXTURE, Material.AMBIENT_TEXTURE, Material.SPECULAR_TEXTURE, Material.EMISSIVE_TEXTURE, Material.ENVIRONMENT_TEXTURE ];

Material.prototype.applyToRenderInstance = function(ri)
{
	if(this.blend_mode != LS.Blend.NORMAL)
		ri.flags |= RI_BLEND;

	if(this.blend_mode == LS.Blend.CUSTOM && this.blend_func)
		ri.blend_func = this.blend_func;
	else
		ri.blend_func = LS.BlendFunctions[ this.blend_mode ];
}

// RENDERING METHODS
Material.prototype.fillShaderQuery = function(scene)
{
	var query = this._query;
	query.clear();

	//iterate through textures in the material
	for(var i in this.textures) 
	{
		var sampler = this.getTextureSampler(i);
		if(!sampler)
			continue;
		var uvs = sampler.uvs || Material.DEFAULT_UVS[i] || "0";

		var texture = Material.getTextureFromSampler( sampler );
		if(!texture) //loading or non-existant
			continue;

		query.macros[ "USE_" + i.toUpperCase() + (texture.texture_type == gl.TEXTURE_2D ? "_TEXTURE" : "_CUBEMAP") ] = "uvs_" + uvs;
	}

	//if(this.reflection_factor > 0.0) 
	//	macros.USE_REFLECTION = "";	

	//extra macros
	if(this.extra_macros)
		for(var im in this.extra_macros)
			query.macros[im] = this.extra_macros[im];
}

//Fill with info about the light
// This is hard to precompute and reuse because here macros depend on the node (receive_shadows?), on the scene (shadows enabled?), on the material (contant diffuse?) 
// and on the light itself
/*
Material.prototype.getLightShaderMacros = function(light, node, scene, render_settings)
{
	var macros = {};

	var use_shadows = light.cast_shadows && light._shadowmap && light._light_matrix != null && !render_settings.shadows_disabled;

	//light macros
	if(light.use_diffuse && !this.constant_diffuse)
		macros.USE_DIFFUSE_LIGHT = "";
	if(light.use_specular && this.specular_factor > 0)
		macros.USE_SPECULAR_LIGHT = "";
	if(light.type == Light.DIRECTIONAL)
		macros.USE_DIRECTIONAL_LIGHT = "";
	else if(light.type == Light.SPOT)
		macros.USE_SPOT_LIGHT = "";
	if(light.spot_cone)
		macros.USE_SPOT_CONE = "";
	if(light.linear_attenuation)
		macros.USE_LINEAR_ATTENUATION = "";
	if(light.range_attenuation)
		macros.USE_RANGE_ATTENUATION = "";

	var light_projective_texture = light.projective_texture;
	if(light_projective_texture && light_projective_texture.constructor == String)
		light_projective_texture = ResourcesManager.textures[light_projective_texture];

	if(light_projective_texture)
	{
		macros.USE_PROJECTIVE_LIGHT = "";
		if(light_projective_texture.texture_type == gl.TEXTURE_CUBE_MAP)
			macros.USE_PROJECTIVE_LIGHT_CUBEMAP = "";
	}

	var light_average_texture = light.average_texture;
	if(light_average_texture && light_average_texture.constructor == String)
		light_average_texture = ResourcesManager.textures[light_average_texture];
	if(light_average_texture)
		macros.USE_TEXTURE_AVERAGE_LIGHT = "";

	//if(vec3.squaredLength( light.color ) < 0.001 || node.flags.ignore_lights)
	//	macros.USE_IGNORE_LIGHT = "";

	if(light.offset > 0.001)
		macros.USE_LIGHT_OFFSET = "";

	if(use_shadows && node.flags.receive_shadows != false)
	{
		macros.USE_SHADOW_MAP = "";
		if(light._shadowmap && light._shadowmap.texture_type == gl.TEXTURE_CUBE_MAP)
			macros.USE_SHADOW_CUBEMAP = "";
		if(light.hard_shadows || macros.USE_SHADOW_CUBEMAP != null)
			macros.USE_HARD_SHADOWS = "";

		macros.SHADOWMAP_OFFSET = "";
	}

	return macros;
}
*/

Material.prototype.fillUniforms = function( scene, options )
{
	var uniforms = {};
	var samplers = {};

	uniforms.u_material_color = this._color;
	uniforms.u_ambient_color = scene.info ? scene.info.ambient_color : this._diffuse;
	uniforms.u_diffuse_color = this._diffuse;

	uniforms.u_specular = this._specular_data;
	uniforms.u_texture_matrix = this.uvs_matrix;

	uniforms.u_reflection = this.reflection_factor;

	//iterate through textures in the material
	for(var i in this.textures) 
	{
		var texture_info = this.getTextureSampler(i);
		if(!texture_info) continue;

		var texture = Material.getTextureFromSampler( texture_info );
		if(!texture) //loading or non-existant
			continue;

		samplers[ i + (texture.texture_type == gl.TEXTURE_2D ? "_texture" : "_cubemap") ] = texture_info;
	}

	//add extra uniforms
	for(var i in this.extra_uniforms)
		uniforms[i] = this.extra_uniforms[i];

	this._uniforms = uniforms;
	this._samplers = samplers; //samplers without fixed slot
}

/**
* Configure the material getting the info from the object
* @method configure
* @param {Object} object to configure from
*/
Material.prototype.configure = function(o)
{
	for(var i in o)
		this.setProperty( i, o[i] );
}

/**
* Serialize this material 
* @method serialize
* @return {Object} object with the serialization info
*/
Material.prototype.serialize = function()
{
	 var o = LS.cloneObject(this);
	 o.material_class = LS.getObjectClassName(this);
	 return o;
}


/**
* Clone this material (keeping the class)
* @method clone
* @return {Material} Material instance
*/
Material.prototype.clone = function()
{
	var data = this.serialize();
	if(data.uid)
		delete data.uid;
	return new this.constructor( JSON.parse( JSON.stringify( data )) );
}

/**
* Loads and assigns a texture to a channel
* @method loadAndSetTexture
* @param {Texture || url} texture_or_filename
* @param {String} channel
*/
Material.prototype.loadAndSetTexture = function(channel, texture_or_filename, options)
{
	options = options || {};
	var that = this;
	//if(!this.material) this.material = new Material();

	if( typeof(texture_or_filename) === "string" ) //it could be the url or the internal texture name 
	{
		if(texture_or_filename[0] != ":")//load if it is not an internal texture
			LS.ResourcesManager.load(texture_or_filename,options, function(texture) {
				that.setTexture(channel, texture);
				if(options.on_complete)
					options.on_complete();
			});
		else
			this.setTexture(channel, texture_or_filename);
	}
	else //otherwise just assign whatever
	{
		this.setTexture(channel, texture_or_filename);
		if(options.on_complete)
			options.on_complete();
	}
}

/**
* gets all the properties and its types
* @method getProperties
* @return {Object} object with name:type
*/
Material.prototype.getProperties = function()
{
	var o = {
		color:"vec3",
		opacity:"number",
		shader_name: "string",
		blend_mode: "number",
		specular_factor:"number",
		specular_gloss:"number",
		alpha_test:"boolean",
		alpha_test_shadows:"boolean",
		uvs_matrix:"mat3"
	};

	var textures = this.getTextureChannels();
	for(var i in textures)
		o["tex_" + textures[i]] = "Texture"; //changed from Sampler
	return o;
}

/**
* gets all the properties and its types
* @method getProperty
* @return {Object} object with name:type
*/
Material.prototype.getProperty = function(name)
{
	if(name.substr(0,4) == "tex_")
		return this.textures[ name.substr(4) ];
	return this[name];
}


/**
* gets all the properties and its types
* @method getProperty
* @return {Object} object with name:type
*/
Material.prototype.setProperty = function( name, value )
{
	if(name.substr(0,4) == "tex_")
	{
		if( (value && (value.constructor === String || value.constructor === GL.Texture)) || !value)
			this.setTexture( name.substr(4), value );
		return true;
	}

	switch(name)
	{
		//numbers
		case "opacity": 
		case "specular_factor":
		case "specular_gloss":
		case "reflection": 
			if(value.constructor === Number)
				this[name] = value; 
			break;
		//bools
		//strings
		case "alpha_test":
		case "alpha_test_shadows":
		case "blend_mode":
		case "shader_name":
			this[name] = value; 
			break;
		//vectors
		case "uvs_matrix":
		case "color": 
			if(this[name].length == value.length)
				this[name].set( value );
			break;
		case "textures":
			//legacy
			for(var i in value)
			{
				var tex = value[i];
				if(typeof(tex) == "string")
					tex = { texture: tex, uvs: "0", wrap: 0, minFilter: 0, magFilter: 0 };
				this.textures[i] = tex;
			}
			//this.textures = cloneObject(value);
			break;
		case "transparency": //special cases
			this.opacity = 1 - value;
			break;
		default:
			return false;
	}
	return true;
}

Material.prototype.setPropertyValueFromPath = function( path, value, offset )
{
	offset = offset || 0;

	if( path.length < (offset+1) )
		return;

	//maybe check if path is texture?
	//TODO

	//assign
	this.setProperty( path[ offset ], value );
}

Material.prototype.getPropertyInfoFromPath = function( path )
{
	if( path.length < 1)
		return;

	var varname = path[0];
	var type = null;

	switch(varname)
	{
		case "opacity": 
		case "transparency":
		case "specular_factor":
		case "specular_gloss":
		case "reflection": 
		case "blend_mode":
			type = "number"; break;
		//strings
		case "shader_name":
			type = "string"; break;
		//bools
		case "alpha_test":
		case "alpha_test_shadows":
			type = "boolean"; break;
		//vectors
		case "uvs_matrix":
			type = "mat3"; break;
		case "color": 
			type = "vec3"; break;
		case "textures":
			type = "Texture"; break;
		default:
			return null;
	}

	return {
		node: this._root,
		target: this,
		name: varname,
		value: this[varname],
		type: type
	};
}

/**
* gets all the texture channels supported by this material
* @method getTextureChannels
* @return {Array} array with the name of every channel supported by this material
*/
Material.prototype.getTextureChannels = function()
{
	if(this.constructor.texture_channels)
		return this.constructor.texture_channels;
	return [];
}

/**
* Assigns a texture to a channel and its sampling parameters
* @method setTexture
* @param {String} channel for a list of supported channels by this material call getTextureChannels()
* @param {Texture} texture
* @param {Object} sampler_options
*/
Material.prototype.setTexture = function( channel, texture, sampler_options ) {
	if(!channel)
		throw("Material.prototype.setTexture channel must be specified");

	if(!texture)
	{
		delete this.textures[channel];
		return;
	}

	var sampler = this.textures[channel];
	if(!sampler)
		this.textures[channel] = sampler = { texture: texture, uvs: Material.DEFAULT_UVS[channel] || "0", wrap: 0, minFilter: 0, magFilter: 0 };
	else if(sampler.texture == texture)
		return sampler;
	else
		sampler.texture = texture;

	if(sampler_options)
		for(var i in sampler_options)
			sampler[i] = sampler_options[i];

	if(texture.constructor === String && texture[0] != ":")
		LS.ResourcesManager.load(texture);

	return sampler;
}

/**
* Set a property of the sampling (wrap, uvs, filter)
* @method setTextureProperty
* @param {String} channel for a list of supported channels by this material call getTextureChannels()
* @param {String} property could be "uvs", "filter", "wrap"
* @param {*} value the value, for uvs check Material.TEXTURE_COORDINATES, filter is gl.NEAREST or gl.LINEAR and wrap gl.CLAMP_TO_EDGE, gl.MIRROR or gl.REPEAT
*/
Material.prototype.setTextureProperty = function( channel, property, value )
{
	var sampler = this.textures[channel];

	if(!sampler)
	{
		if(property == "texture")
			this.textures[channel] = sampler = { texture: value, uvs: Material.DEFAULT_UVS[channel] || "0", wrap: 0, minFilter: 0, magFilter: 0 };
		return;
	}

	sampler[ property ] = value;
}

/**
* Returns the texture in a channel
* @method getTexture
* @param {String} channel default is COLOR
* @return {Texture}
*/
Material.prototype.getTexture = function( channel ) {
	channel = channel || Material.COLOR_TEXTURE;

	var v = this.textures[channel];
	if(!v) 
		return null;

	if(v.constructor === String)
		return LS.ResourcesManager.textures[v];

	var tex = v.texture;
	if(!tex)
		return null;
	if(tex.constructor === String)
		return LS.ResourcesManager.textures[tex];
	else if(tex.constructor == Texture)
		return tex;
	return null;
}

/**
* Returns the texture sampler info of one texture channel (filter, wrap, uvs)
* @method getTextureSampler
* @param {String} channel get available channels using getTextureChannels
* @return {Texture}
*/
Material.prototype.getTextureSampler = function(channel) {
	return this.textures[ channel ];
}

Material.getTextureFromSampler = function(sampler)
{
	var texture = sampler.constructor === String ? sampler : sampler.texture;
	if(!texture) //weird case
		return null;

	//fetch
	if(texture.constructor === String)
		texture = LS.ResourcesManager.textures[ texture ];
	
	if (!texture || texture.constructor != Texture)
		return null;
	return texture;
}

/**
* Assigns a texture sampler to one texture channel (filter, wrap, uvs)
* @method setTextureInfo
* @param {String} channel default is COLOR
* @param {Object} sampler { texture, uvs, wrap, filter }
*/
Material.prototype.setTextureSampler = function(channel, sampler) {
	if(!channel)
		throw("Cannot call Material setTextureSampler without channel");
	if(!sampler)
		delete this.textures[ channel ];
	else
		this.textures[ channel ] = sampler;
}

/**
* Collects all the resources needed by this material (textures)
* @method getResources
* @param {Object} resources object where all the resources are stored
* @return {Texture}
*/
Material.prototype.getResources = function (res)
{
	for(var i in this.textures)
	{
		var sampler = this.textures[i];
		if(!sampler) 
			continue;
		if(typeof(sampler.texture) == "string")
			res[ sampler.texture ] = GL.Texture;
	}
	return res;
}

/**
* Event used to inform if one resource has changed its name
* @method onResourceRenamed
* @param {Object} resources object where all the resources are stored
* @return {Texture}
*/
Material.prototype.onResourceRenamed = function (old_name, new_name, resource)
{
	for(var i in this.textures)
	{
		var sampler = this.textures[i];
		if(!sampler)
			continue;
		if(sampler.texture == old_name)
			sampler.texture = new_name;
	}
}

/**
* Loads all the textures inside this material, by sending the through the ResourcesManager
* @method loadTextures
*/

Material.prototype.loadTextures = function ()
{
	var res = this.getResources({});
	for(var i in res)
		LS.ResourcesManager.load( i );
}

/**
* Register this material in a materials pool to be shared with other nodes
* @method registerMaterial
* @param {String} name name given to this material, it must be unique
*/
Material.prototype.registerMaterial = function(name)
{
	this.name = name;
	LS.ResourcesManager.registerResource(name, this);
	this.material = name;
}

Material.prototype.getCategory = function()
{
	return this.category || "Material";
}

Material.prototype.updatePreview = function(size, options)
{
	options = options || {};

	var res = {};
	this.getResources(res);

	for(var i in res)
	{
		var resource = LS.ResourcesManager.resources[i];
		if(!resource)
		{
			console.warn("Cannot generate preview with resources missing.");
			return null;
		}
	}

	if(LS.GlobalScene.info.textures.environment)
		options.environment = LS.GlobalScene.info.textures.environment;

	size = size || 256;
	var preview = LS.Renderer.renderMaterialPreview( this, size, options );
	if(!preview)
		return;

	this.preview = preview;
	if(preview.toDataURL)
		this.preview_url = preview.toDataURL("image/png");
}

Material.prototype.getLocator = function()
{
	if(this._root)
		return this._root.uid + "/material";
	return this.uid;
}

Material.processShaderCode = function(code)
{
	var lines = code.split("\n");
	for(var i in lines)
		lines[i] = lines[i].split("//")[0]; //remove comments
	code = lines.join("");
	if(!code)
		return null;
	return code;
}

Material.prototype.createProperty = function( name, value, type )
{
	if(type)
		this.constructor[ "@" + name ] = { type: type };

	//basic type
	if(value.constructor === Number || value.constructor === String || value.constructor === Boolean)
	{
		this[ name ] = value;
		return;
	}

	//vector type
	if(value.constructor === Float32Array)
	{
		var private_name = "_" + name;
		value = new Float32Array( value ); //clone
		this[ private_name ] = value; //this could be removed...

		Object.defineProperty( this, name, {
			get: function() { return value; },
			set: function(v) { value.set( v ); },
			enumerable: true
		});
	}
}

Material.prototype.prepareMaterial = function( scene )
{
	if(!this._uniforms)
	{
		this._uniforms = {};
		this._samplers = {};
	}
	this.fillShaderQuery( scene ); //update shader macros on this material
	this.fillUniforms( scene ); //update uniforms
}


LS.registerMaterialClass(Material);
LS.Material = Material;



//StandardMaterial class **************************
/* Warning: a material is not a component, because it can be shared by multiple nodes */

/**
* StandardMaterial class improves the material class
* @namespace LS
* @class StandardMaterial
* @constructor
* @param {String} object to configure from
*/

function StandardMaterial(o)
{
	Material.call(this,null); //do not pass the object, it is called later

	this.createProperty("ambient", new Float32Array([1.0,1.0,1.0]), "color" );
	this.createProperty("emissive", new Float32Array(3), "color" );
	//this.emissive = new Float32Array([0.0,0.0,0.0]);
	this.backlight_factor = 0;

	this.specular_ontop = false;
	this.reflection_factor = 0.0;
	this.reflection_fresnel = 1.0;
	this.reflection_additive = false;
	this.reflection_specular = false;
	this.createProperty( "velvet", new Float32Array([0.5,0.5,0.5]), "color" );
	this.velvet_exp = 0.0;
	this.velvet_additive = false;
	this._velvet_info = vec4.create();
	this._detail = new Float32Array([0.0, 10, 10]);
	this._extra_data = vec4.create();

	this.normalmap_factor = 1.0;
	this.normalmap_tangent = true;
	this.displacementmap_factor = 0.1;
	this.bumpmap_factor = 1.0;
	this.use_scene_ambient = true;

	//used for special fx 
	this.extra_surface_shader_code = "";

	this.extra_uniforms = {};

	if(o) 
		this.configure(o);
}

Object.defineProperty( StandardMaterial.prototype, 'detail_factor', {
	get: function() { return this._detail[0]; },
	set: function(v) { this._detail[0] = v; },
	enumerable: true
});

Object.defineProperty( StandardMaterial.prototype, 'detail_scale', {
	get: function() { return this._detail.subarray(1,3); },
	set: function(v) { this._detail[1] = v[0]; this._detail[2] = v[1]; },
	enumerable: true
});

Object.defineProperty( StandardMaterial.prototype, 'extra_factor', {
	get: function() { return this._extra_data[3]; },
	set: function(v) { this._extra_data[3] = v; },
	enumerable: true
});

Object.defineProperty( StandardMaterial.prototype, 'extra_color', {
	get: function() { return this._extra_data.subarray(0,3); },
	set: function(v) { this._extra_data.set( v ); },
	enumerable: true
});


StandardMaterial.DETAIL_TEXTURE = "detail";
StandardMaterial.NORMAL_TEXTURE = "normal";
StandardMaterial.DISPLACEMENT_TEXTURE = "displacement";
StandardMaterial.BUMP_TEXTURE = "bump";
StandardMaterial.REFLECTIVITY_TEXTURE = "reflectivity";
StandardMaterial.IRRADIANCE_TEXTURE = "irradiance";
StandardMaterial.EXTRA_TEXTURE = "extra";

StandardMaterial.texture_channels = [ Material.COLOR_TEXTURE, Material.OPACITY_TEXTURE, Material.AMBIENT_TEXTURE, Material.SPECULAR_TEXTURE, Material.EMISSIVE_TEXTURE, StandardMaterial.DETAIL_TEXTURE, StandardMaterial.NORMAL_TEXTURE, StandardMaterial.DISPLACEMENT_TEXTURE, StandardMaterial.BUMP_TEXTURE, StandardMaterial.REFLECTIVITY_TEXTURE, Material.ENVIRONMENT_TEXTURE, StandardMaterial.IRRADIANCE_TEXTURE, StandardMaterial.EXTRA_TEXTURE ];
StandardMaterial.available_shaders = ["default","lowglobal","phong_texture","flat","normal","phong","flat_texture"];

StandardMaterial.coding_help = "\
Input IN -> info about the mesh\n\
SurfaceOutput o -> info about the surface properties of this pixel\n\
\n\
struct Input {\n\
	vec4 color;\n\
	vec3 vertex;\n\
	vec3 normal;\n\
	vec2 uv;\n\
	vec2 uv1;\n\
	\n\
	vec3 camPos;\n\
	vec3 viewDir;\n\
	vec3 worldPos;\n\
	vec3 worldNormal;\n\
	vec4 screenPos;\n\
};\n\
\n\
struct SurfaceOutput {\n\
	vec3 Albedo;\n\
	vec3 Normal;\n\
	vec3 Ambient;\n\
	vec3 Emission;\n\
	float Specular;\n\
	float Gloss;\n\
	float Alpha;\n\
	float Reflectivity;\n\
};\n\
";

// RENDERING METHODS
StandardMaterial.prototype.fillShaderQuery = function( scene )
{
	var query = this._query;
	query.clear();

	//iterate through textures in the material
	for(var i in this.textures) 
	{
		var texture_info = this.getTextureSampler(i);
		if(!texture_info) continue;
		var texture_uvs = texture_info.uvs || Material.DEFAULT_UVS[i] || "0";

		var texture = Material.getTextureFromSampler( texture_info );
		if(!texture) //loading or non-existant
			continue;
		
		/*
		if(i == "environment")
		{
			if(this.reflection_factor <= 0) 
				continue;
		}
		else */

		if(i == "normal")
		{
			if(this.normalmap_factor != 0.0 && (!this.normalmap_tangent || (this.normalmap_tangent && gl.derivatives_supported)) )
			{
				query.macros.USE_NORMAL_TEXTURE = "uvs_" + texture_uvs;
				if(this.normalmap_factor != 0.0)
					query.macros.USE_NORMALMAP_FACTOR = "";
				if(this.normalmap_tangent && gl.derivatives_supported)
					query.macros.USE_TANGENT_NORMALMAP = "";
			}
			continue;
		}
		else if(i == "displacement")
		{
			if(this.displacementmap_factor != 0.0 && gl.derivatives_supported )
			{
				query.macros.USE_DISPLACEMENT_TEXTURE = "uvs_" + texture_uvs;
				if(this.displacementmap_factor != 1.0)
					query.macros.USE_DISPLACEMENTMAP_FACTOR = "";
			}
			continue;
		}
		else if(i == "bump")
		{
			if(this.bump_factor != 0.0 && gl.derivatives_supported )
			{
				query.macros.USE_BUMP_TEXTURE = "uvs_" + texture_uvs;
				if(this.bumpmap_factor != 1.0)
					query.macros.USE_BUMP_FACTOR = "";
			}
			continue;
		}

		query.macros[ "USE_" + i.toUpperCase() + (texture.texture_type == gl.TEXTURE_2D ? "_TEXTURE" : "_CUBEMAP") ] = "uvs_" + texture_uvs;
	}

	if(this.velvet && this.velvet_exp) //first light only
		query.macros.USE_VELVET = "";
	
	if(this.emissive_material) //dont know whats this
		query.macros.USE_EMISSIVE_MATERIAL = "";
	
	if(this.specular_ontop)
		query.macros.USE_SPECULAR_ONTOP = "";
	if(this.specular_on_alpha)
		query.macros.USE_SPECULAR_ON_ALPHA = "";
	if(this.reflection_specular)
		query.macros.USE_SPECULAR_IN_REFLECTION = "";
	if(this.backlight_factor > 0.001)
		query.macros.USE_BACKLIGHT = "";

	if(this.reflection_factor > 0.0) 
		query.macros.USE_REFLECTION = "";

	//extra code
	if(this.extra_surface_shader_code)
	{
		var code = null;
		if(this._last_extra_surface_shader_code != this.extra_surface_shader_code)
		{
			code = Material.processShaderCode( this.extra_surface_shader_code );
			this._last_processed_extra_surface_shader_code = code;
		}
		else
			code = this._last_processed_extra_surface_shader_code;
		if(code)
			query.macros.USE_EXTRA_SURFACE_SHADER_CODE = code;
	}

	//extra macros
	if(this.extra_macros)
		for(var im in this.extra_macros)
			query.macros[im] = this.extra_macros[im];
}

StandardMaterial.prototype.fillUniforms = function( scene, options )
{
	var uniforms = {};
	var samplers = {};

	uniforms.u_material_color = this._color;

	//uniforms.u_ambient_color = node.flags.ignore_lights ? [1,1,1] : [scene.ambient_color[0] * this.ambient[0], scene.ambient_color[1] * this.ambient[1], scene.ambient_color[2] * this.ambient[2]];
	if(this.use_scene_ambient && scene.info)
		uniforms.u_ambient_color = vec3.fromValues(scene.info.ambient_color[0] * this.ambient[0], scene.info.ambient_color[1] * this.ambient[1], scene.info.ambient_color[2] * this.ambient[2]);
	else
		uniforms.u_ambient_color = this.ambient;

	uniforms.u_emissive_color = this.emissive || vec3.create();
	uniforms.u_specular = this._specular_data;
	uniforms.u_reflection_info = [ (this.reflection_additive ? -this.reflection_factor : this.reflection_factor), this.reflection_fresnel ];
	uniforms.u_backlight_factor = this.backlight_factor;
	uniforms.u_normalmap_factor = this.normalmap_factor;
	uniforms.u_displacementmap_factor = this.displacementmap_factor;
	uniforms.u_bumpmap_factor = this.bumpmap_factor;

	this._velvet_info.set( this.velvet );
	this._velvet_info[3] = this.velvet_additive ? this.velvet_exp : -this.velvet_exp;
	uniforms.u_velvet_info = this._velvet_info;

	uniforms.u_detail_info = this._detail;

	uniforms.u_extra_data = this._extra_data;

	uniforms.u_texture_matrix = this.uvs_matrix;

	//iterate through textures in the material
	for(var i in this.textures) 
	{
		var sampler = this.getTextureSampler(i);
		if(!sampler)
			continue;

		var texture = sampler.texture;
		if(!texture)
			continue;

		if(texture.constructor === String)
			texture = LS.ResourcesManager.textures[texture];
		else if (texture.constructor != Texture)
			continue;		
		
		if(!texture)  //loading or non-existant
			sampler = { texture: ":missing" };
		else
			samplers[ i + (texture.texture_type == gl.TEXTURE_2D ? "_texture" : "_cubemap") ] = sampler;

		var texture_uvs = sampler.uvs || Material.DEFAULT_UVS[i] || "0";
		//last_slot += 1;

		if(texture)
		{
			if(i == "irradiance" && texture.type == gl.TEXTURE_2D)
			{
				texture.bind(0);
				texture.setParameter( gl.TEXTURE_MIN_FILTER, gl.LINEAR );
				texture.setParameter( gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE );
				texture.setParameter( gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE );
				//texture.min_filter = gl.GL_LINEAR;
			}
		}
	}

	//add extra uniforms
	for(var i in this.extra_uniforms)
		uniforms[i] = this.extra_uniforms[i];

	this._uniforms = uniforms;
	this._samplers = samplers;
}

/**
* assign a value to a property in a safe way
* @method setProperty
* @param {Object} object to configure from
*/
StandardMaterial.prototype.setProperty = function(name, value)
{
	//redirect to base material
	if( Material.prototype.setProperty.call(this,name,value) )
		return true;

	//regular
	switch(name)
	{
		//numbers
		case "backlight_factor":
		case "reflection_factor":
		case "reflection_fresnel":
		case "velvet_exp":
		case "velvet_additive":
		case "normalmap_tangent":
		case "normalmap_factor":
		case "displacementmap_factor":
		case "extra_factor":
		case "detail_factor":
		//strings
		//bools
		case "specular_ontop":
		case "normalmap_tangent":
		case "reflection_specular":
		case "use_scene_ambient":
		case "extra_surface_shader_code":
			this[name] = value; 
			break;
		//vectors
		case "ambient":	
		case "emissive": 
		case "velvet":
		case "detail_scale":
		case "extra_color":
			if(this[name].length == value.length)
				this[name].set(value);
			break;
		case "extra_uniforms":
			this.extra_uniforms = LS.cloneObject(value);
			break;
		default:
			return false;
	}
	return true;
}

/**
* gets all the properties and its types
* @method getProperties
* @return {Object} object with name:type
*/
StandardMaterial.prototype.getProperties = function()
{
	//get from the regular material
	var o = Material.prototype.getProperties.call(this);

	//add some more
	o.merge({
		backlight_factor:"number",
		reflection_factor:"number",
		reflection_fresnel:"number",
		velvet_exp:"number",

		normalmap_factor:"number",
		displacementmap_factor:"number",
		extra_factor:"number",
		extra_surface_shader_code:"string",

		ambient:"vec3",
		emissive:"vec3",
		velvet:"vec3",
		extra_color:"vec3",
		detail_factor:"number",
		detail_scale:"vec2",

		specular_ontop:"boolean",
		normalmap_tangent:"boolean",
		reflection_specular:"boolean",
		use_scene_ambient:"boolean",
		velvet_additive:"boolean"
	});

	return o;
}

SurfaceMaterial.prototype.getPropertyInfoFromPath = function( path )
{
	if( path.length < 1)
		return;

	var info = Material.prototype.getPropertyInfoFromPath.call(this,path);
	if(info)
		return info;

	var varname = path[0];

	switch(varname)
	{
		case "backlight_factor":
		case "reflection_factor":
		case "reflection_fresnel":
		case "velvet_exp":
		case "normalmap_factor":
		case "displacementmap_factor":
		case "extra_factor":
		case "detail_factor":
			type = "number"; break;
		case "extra_surface_shader_code":
			type = "string"; break;
		case "ambient":
		case "emissive":
		case "velvet":
		case "extra_color":
			type = "vec3"; break;
		case "detail_scale":
			type = "vec2"; break;
		case "specular_ontop":
		case "normalmap_tangent":
		case "reflection_specular":
		case "use_scene_ambient":
		case "velvet_additive":
			type = "boolean"; break;
		default:
			return null;
	}

	return {
		node: this._root,
		target: this,
		name: varname,
		value: this[varname],
		type: type
	};
}

LS.registerMaterialClass( StandardMaterial );
LS.StandardMaterial = StandardMaterial;
function CustomMaterial( o )
{
	Material.call( this, null );

	this.shader_name = "base";

	this.vs_code = "";
	this.code = "void surf(in Input IN, inout SurfaceOutput o) {\n\
	o.Albedo = vec3(1.0) * IN.color.xyz;\n\
	o.Normal = IN.worldNormal;\n\
	o.Emission = vec3(0.0);\n\
	o.Specular = 1.0;\n\
	o.Gloss = 40.0;\n\
	o.Reflectivity = 0.0;\n\
	o.Alpha = IN.color.a;\n}\n";

	this._uniforms = {};

	this.properties = []; //array of configurable properties
	if(o) 
		this.configure(o);

	this.flags = 0;

	this.computeCode();
}

CustomMaterial.icon = "mini-icon-material.png";
CustomMaterial.coding_help = "\
struct Input {\n\
	vec4 color;\n\
	vec3 vertex;\n\
	vec3 normal;\n\
	vec2 uv;\n\
	vec2 uv1;\n\
	\n\
	vec3 camPos;\n\
	vec3 viewDir;\n\
	vec3 worldPos;\n\
	vec3 worldNormal;\n\
	vec4 screenPos;\n\
};\n\
\n\
struct SurfaceOutput {\n\
	vec3 Albedo; /*store the color output here*/\n\
	vec3 Normal;\n\
	vec3 Emission;\n\
	float Specular;\n\
	float Gloss;\n\
	float Alpha;\n\
	float Reflectivity;\n\
};\n\
";

CustomMaterial.prototype.onCodeChange = function()
{
	this.computeCode();
}

CustomMaterial.prototype.getCode = function()
{
	return this.code;
}

CustomMaterial.prototype.computeCode = function()
{
	var uniforms_code = "";
	for(var i = 0, l = this.properties.length; i < l; ++i )
	{
		var code = "uniform ";
		var prop = this.properties[i];
		switch(prop.type)
		{
			case 'number': code += "float "; break;
			case 'vec2': code += "vec2 "; break;
			case 'color':
			case 'vec3': code += "vec3 "; break;
			case 'color4':
			case 'vec4': code += "vec4 "; break;
			case 'texture': code += "sampler2D "; break;
			case 'cubemap': code += "samplerCube "; break;
			default: continue;
		}
		code += prop.name + ";";
		uniforms_code += code;
	}

	var lines = this.code.split("\n");
	for(var i = 0, l = lines.length; i < l; ++i )
		lines[i] = lines[i].split("//")[0]; //remove comments

	this.surf_code = uniforms_code + lines.join("");
}

// RENDERING METHODS
CustomMaterial.prototype.onModifyQuery = function( query )
{
	if(this._ps_uniforms_code)
	{
		if(query.macros.USE_PIXEL_SHADER_UNIFORMS)
			query.macros.USE_PIXEL_SHADER_UNIFORMS += this._ps_uniforms_code;
		else
			query.macros.USE_PIXEL_SHADER_UNIFORMS = this._ps_uniforms_code;
	}

	if(this._ps_functions_code)
	{
		if(query.macros.USE_PIXEL_SHADER_FUNCTIONS)
			query.macros.USE_PIXEL_SHADER_FUNCTIONS += this._ps_functions_code;
		else
			query.macros.USE_PIXEL_SHADER_FUNCTIONS = this._ps_functions_code;
	}

	if(this._ps_code)
	{
		if(query.macros.USE_PIXEL_SHADER_CODE)
			query.macros.USE_PIXEL_SHADER_CODE += this._ps_code;
		else
			query.macros.USE_PIXEL_SHADER_CODE = this._ps_code;	
	}

	query.macros.USE_SURFACE_SHADER = this.surf_code;
}

CustomMaterial.prototype.fillShaderQuery = function(scene)
{
	var query = this._query;
	query.clear();
	if( this.textures["environment"] )
	{
		var sampler = this.textures["environment"];
		var tex = LS.getTexture( sampler.texture );
		if(tex)
			query.macros[ "USE_ENVIRONMENT_" + (tex.type == gl.TEXTURE_2D ? "TEXTURE" : "CUBEMAP") ] = sampler.uvs;
	}
}


CustomMaterial.prototype.fillUniforms = function( scene, options )
{
	var samplers = {};

	for(var i = 0, l = this.properties.length; i < l; ++i )
	{
		var prop = this.properties[i];
		if(prop.type == "texture" || prop.type == "cubemap" || prop.type == "sampler")
		{
			if(!prop.value)
				continue;

			var tex_name = prop.type == "sampler" ? prop.value.texture : prop.value;
			var texture = LS.getTexture( tex_name );
			if(!texture)
				texture = ":missing";
			samplers[ prop.name ] = texture;
		}
		else
			this._uniforms[ prop.name ] = prop.value;
	}

	this._uniforms.u_material_color = this._color;

	if(this.textures["environment"])
	{
		var sampler = this.textures["environment"];
		var texture = LS.getTexture( sampler.texture );
		if(texture)
			samplers[ "environment" + (texture.texture_type == gl.TEXTURE_2D ? "_texture" : "_cubemap") ] = sampler;
	}

	this._samplers = samplers;
}

CustomMaterial.prototype.configure = function(o) { 
	LS.cloneObject(o, this);
	this.computeCode();
}

/**
* Event used to inform if one resource has changed its name
* @method onResourceRenamed
* @param {Object} resources object where all the resources are stored
* @return {Texture}
*/
CustomMaterial.prototype.onResourceRenamed = function (old_name, new_name, resource)
{
	//global
	Material.prototype.onResourceRenamed.call( this, old_name, new_name, resource );

	//specific
	for(var i = 0, l = this.properties.length; i < l; ++i )
	{
		var prop = this.properties[i];
		if( prop.value == old_name)
			prop.value = new_name;
	}
}


/**
* gets all the properties and its types
* @method getProperties
* @return {Object} object with name:type
*/
CustomMaterial.prototype.getProperties = function()
{
	var o = {
		color:"vec3",
		opacity:"number",
		shader_name: "string",
		blend_mode: "number",
		code: "string"
	};

	//from this material
	for(var i in this.properties)
	{
		var prop = this.properties[i];
		o[prop.name] = prop.type;
	}	

	return o;
}

/**
* gets all the properties and its types
* @method getProperty
* @return {Object} object with name:type
*/
CustomMaterial.prototype.getProperty = function( name )
{
	if(this[name])
		return this[name];

	if( name.substr(0,4) == "tex_")
	{
		var tex = this.textures[ name.substr(4) ];
		if(!tex) return null;
		return tex.texture;
	}

	for(var i = 0, l = this.properties.length; i < l; ++i )
	{
		var prop = this.properties[i];
		if(prop.name == name)
			return prop.value;
	}	

	return null;
}

/**
* assign a value to a property in a safe way
* @method setProperty
* @param {Object} object to configure from
*/
CustomMaterial.prototype.setProperty = function(name, value)
{
	//redirect to base material
	if( Material.prototype.setProperty.call(this,name,value) )
		return true;

	for(var i = 0, l = this.properties.length; i < l; ++i )
	{
		var prop = this.properties[i];
		if(prop.name != name)
			continue;
		prop.value = value;
		return true;
	}

	return false;
}

/*
CustomMaterial.prototype.setPropertyValueFromPath = function( path, value, offset )
{
	if( path.length < (offset+1) )
		return;
	return this.setProperty( path[offset], value );
}
*/

CustomMaterial.prototype.getPropertyInfoFromPath = function( path )
{
	if( path.length < 1)
		return;

	var varname = path[0];

	for(var i = 0, l = this.properties.length; i < l; ++i )
	{
		var prop = this.properties[i];
		if(prop.name != varname)
			continue;

		return {
			node: this._root,
			target: this,
			name: prop.name,
			value: prop.value,
			type: prop.type
		};
	}

	return;
}


CustomMaterial.prototype.getTextureChannels = function()
{
	var channels = [];

	for(var i = 0, l = this.properties.length; i < l; ++i )
	{
		var prop = this.properties[i];
		if(prop.type != "texture" && prop.type != "cubemap" && prop.type != "sampler" )
			continue;
		channels.push( prop.name );
	}

	return channels;
}

/**
* Assigns a texture to a channel
* @method setTexture
* @param {String} channel 
* @param {Texture} texture
*/
CustomMaterial.prototype.setTexture = function( channel, texture, sampler_options ) {
	if(!channel)
		throw("CustomMaterial.prototype.setTexture channel must be specified");

	var sampler = null;


	//special case
	if(channel == "environment")
		return Material.prototype.setTexture.call(this, channel, texture, sampler_options );

	for(var i = 0; i < this.properties.length; ++i)
	{
		var prop = this.properties[i];
		if(prop.type != "texture" && prop.type != "cubemap" && prop.type != "sampler")
			continue;

		if(channel && prop.name != channel) //assign to the channel or if there is no channel just to the first one
			continue;

		//assign sampler
		sampler = this.textures[ channel ];
		if(!sampler)
			sampler = this.textures[channel] = { texture: texture, uvs: "0", wrap: 0, minFilter: 0, magFilter: 0 }; //sampler

		if(sampler_options)
			for(var i in sampler_options)
				sampler[i] = sampler_options[i];

		prop.value = prop.type == "sampler" ? sampler : texture;
		break;
	}

	//preload texture
	if(texture && texture.constructor == String && texture[0] != ":")
		LS.ResourcesManager.load( texture );

	return sampler;
}

/**
* Collects all the resources needed by this material (textures)
* @method getResources
* @param {Object} resources object where all the resources are stored
* @return {Texture}
*/
CustomMaterial.prototype.getResources = function (res)
{
	for(var i = 0, l = this.properties.length; i < l; ++i )
	{
		var prop = this.properties[i];
		if(prop.type != "texture" && prop.type != "cubemap" && prop.type != "sampler")
			continue;
		if(!prop.value)
			continue;

		var texture = prop.type == "sampler" ? prop.value.texture : prop.value;
		if( typeof( texture ) == "string" )
			res[ texture ] = GL.Texture;
	}

	return res;
}


LS.registerMaterialClass( CustomMaterial );
LS.CustomMaterial = CustomMaterial;
function SurfaceMaterial( o )
{
	Material.call( this, null );

	this.shader_name = "surface";

	this.vs_code = "";
	this.code = "void surf(in Input IN, inout SurfaceOutput o) {\n\
	o.Albedo = vec3(1.0) * IN.color.xyz;\n\
	o.Normal = IN.worldNormal;\n\
	o.Emission = vec3(0.0);\n\
	o.Specular = 1.0;\n\
	o.Gloss = 40.0;\n\
	o.Reflectivity = 0.0;\n\
	o.Alpha = IN.color.a;\n}\n";

	this._uniforms = {};

	this.properties = []; //array of configurable properties
	if(o) 
		this.configure(o);

	this.flags = 0;

	this.computeCode();
}

SurfaceMaterial.icon = "mini-icon-material.png";
SurfaceMaterial.coding_help = "\
struct Input {\n\
	vec4 color;\n\
	vec3 vertex;\n\
	vec3 normal;\n\
	vec2 uv;\n\
	vec2 uv1;\n\
	\n\
	vec3 camPos;\n\
	vec3 viewDir;\n\
	vec3 worldPos;\n\
	vec3 worldNormal;\n\
	vec4 screenPos;\n\
};\n\
\n\
struct SurfaceOutput {\n\
	vec3 Albedo;\n\
	vec3 Normal;\n\
	vec3 Emission;\n\
	float Specular;\n\
	float Gloss;\n\
	float Alpha;\n\
	float Reflectivity;\n\
};\n\
";

SurfaceMaterial.prototype.onCodeChange = function()
{
	this.computeCode();
}

SurfaceMaterial.prototype.getCode = function()
{
	return this.code;
}

SurfaceMaterial.prototype.computeCode = function()
{
	var uniforms_code = "";
	for(var i = 0, l = this.properties.length; i < l; ++i )
	{
		var code = "uniform ";
		var prop = this.properties[i];
		switch(prop.type)
		{
			case 'number': code += "float "; break;
			case 'vec2': code += "vec2 "; break;
			case 'color':
			case 'vec3': code += "vec3 "; break;
			case 'color4':
			case 'vec4': code += "vec4 "; break;
			case 'texture': code += "sampler2D "; break;
			case 'cubemap': code += "samplerCube "; break;
			default: continue;
		}
		code += prop.name + ";";
		uniforms_code += code;
	}

	var lines = this.code.split("\n");
	for(var i = 0, l = lines.length; i < l; ++i )
		lines[i] = lines[i].split("//")[0]; //remove comments

	this.surf_code = uniforms_code + lines.join("");
}

// RENDERING METHODS
SurfaceMaterial.prototype.onModifyQuery = function( query )
{
	if(this._ps_uniforms_code)
	{
		if(query.macros.USE_PIXEL_SHADER_UNIFORMS)
			query.macros.USE_PIXEL_SHADER_UNIFORMS += this._ps_uniforms_code;
		else
			query.macros.USE_PIXEL_SHADER_UNIFORMS = this._ps_uniforms_code;
	}

	if(this._ps_functions_code)
	{
		if(query.macros.USE_PIXEL_SHADER_FUNCTIONS)
			query.macros.USE_PIXEL_SHADER_FUNCTIONS += this._ps_functions_code;
		else
			query.macros.USE_PIXEL_SHADER_FUNCTIONS = this._ps_functions_code;
	}

	if(this._ps_code)
	{
		if(query.macros.USE_PIXEL_SHADER_CODE)
			query.macros.USE_PIXEL_SHADER_CODE += this._ps_code;
		else
			query.macros.USE_PIXEL_SHADER_CODE = this._ps_code;	
	}

	query.macros.USE_SURFACE_SHADER = this.surf_code;
}

SurfaceMaterial.prototype.fillShaderQuery = function(scene)
{
	var query = this._query;
	query.clear();
	if( this.textures["environment"] )
	{
		var sampler = this.textures["environment"];
		var tex = LS.getTexture( sampler.texture );
		if(tex)
			query.macros[ "USE_ENVIRONMENT_" + (tex.type == gl.TEXTURE_2D ? "TEXTURE" : "CUBEMAP") ] = sampler.uvs;
	}
}


SurfaceMaterial.prototype.fillUniforms = function( scene, options )
{
	var samplers = {};

	for(var i = 0, l = this.properties.length; i < l; ++i )
	{
		var prop = this.properties[i];
		if(prop.type == "texture" || prop.type == "cubemap" || prop.type == "sampler")
		{
			if(!prop.value)
				continue;

			var tex_name = prop.type == "sampler" ? prop.value.texture : prop.value;
			var texture = LS.getTexture( tex_name );
			if(!texture)
				texture = ":missing";
			samplers[ prop.name ] = texture;
		}
		else
			this._uniforms[ prop.name ] = prop.value;
	}

	this._uniforms.u_material_color = this._color;

	if(this.textures["environment"])
	{
		var sampler = this.textures["environment"];
		var texture = LS.getTexture( sampler.texture );
		if(texture)
			samplers[ "environment" + (texture.texture_type == gl.TEXTURE_2D ? "_texture" : "_cubemap") ] = sampler;
	}

	this._samplers = samplers;
}

SurfaceMaterial.prototype.configure = function(o) { 
	LS.cloneObject(o, this);
	this.computeCode();
}

/**
* gets all the properties and its types
* @method getProperties
* @return {Object} object with name:type
*/
SurfaceMaterial.prototype.getProperties = function()
{
	var o = {
		color:"vec3",
		opacity:"number",
		shader_name: "string",
		blend_mode: "number",
		code: "string"
	};

	//from this material
	for(var i in this.properties)
	{
		var prop = this.properties[i];
		o[prop.name] = prop.type;
	}	

	return o;
}

/**
* Event used to inform if one resource has changed its name
* @method onResourceRenamed
* @param {Object} resources object where all the resources are stored
* @return {Texture}
*/
SurfaceMaterial.prototype.onResourceRenamed = function (old_name, new_name, resource)
{
	//global
	Material.prototype.onResourceRenamed.call( this, old_name, new_name, resource );

	//specific
	for(var i = 0, l = this.properties.length; i < l; ++i )
	{
		var prop = this.properties[i];
		if( prop.value == old_name)
			prop.value = new_name;
	}
}


/**
* gets all the properties and its types
* @method getProperty
* @return {Object} object with name:type
*/
SurfaceMaterial.prototype.getProperty = function( name )
{
	if(this[name])
		return this[name];

	if( name.substr(0,4) == "tex_")
	{
		var tex = this.textures[ name.substr(4) ];
		if(!tex) return null;
		return tex.texture;
	}

	for(var i = 0, l = this.properties.length; i < l; ++i )
	{
		var prop = this.properties[i];
		if(prop.name == name)
			return prop.value;
	}	

	return null;
}

/**
* assign a value to a property in a safe way
* @method setProperty
* @param {Object} object to configure from
*/
SurfaceMaterial.prototype.setProperty = function(name, value)
{
	//redirect to base material
	if( Material.prototype.setProperty.call(this,name,value) )
		return true;

	for(var i = 0, l = this.properties.length; i < l; ++i )
	{
		var prop = this.properties[i];
		if(prop.name != name)
			continue;
		prop.value = value;
		return true;
	}

	return false;
}

/*
SurfaceMaterial.prototype.setPropertyValueFromPath = function( path, value, offset )
{
	offset = offset || 0;
	if( path.length < (offset+1) )
		return;
	return this.setProperty( path[offset], value );
}
*/

SurfaceMaterial.prototype.getPropertyInfoFromPath = function( path )
{
	if( path.length < 1)
		return;

	var info = Material.prototype.getPropertyInfoFromPath.call(this,path);
	if(info)
		return info;

	var varname = path[0];

	for(var i = 0, l = this.properties.length; i < l; ++i )
	{
		var prop = this.properties[i];
		if(prop.name != varname)
			continue;

		return {
			node: this._root,
			target: this,
			name: prop.name,
			value: prop.value,
			type: prop.type
		};
	}

	return;
}


SurfaceMaterial.prototype.getTextureChannels = function()
{
	var channels = [];

	for(var i = 0, l = this.properties.length; i < l; ++i )
	{
		var prop = this.properties[i];
		if(prop.type != "texture" && prop.type != "cubemap" && prop.type != "sampler" )
			continue;
		channels.push( prop.name );
	}

	return channels;
}

/**
* Assigns a texture to a channel
* @method setTexture
* @param {String} channel 
* @param {Texture} texture
*/
SurfaceMaterial.prototype.setTexture = function( channel, texture, sampler_options ) {
	if(!channel)
		throw("SurfaceMaterial.prototype.setTexture channel must be specified");

	var sampler = null;


	//special case
	if(channel == "environment")
		return Material.prototype.setTexture.call(this, channel, texture, sampler_options );

	for(var i = 0; i < this.properties.length; ++i)
	{
		var prop = this.properties[i];
		if(prop.type != "texture" && prop.type != "cubemap" && prop.type != "sampler")
			continue;

		if(channel && prop.name != channel) //assign to the channel or if there is no channel just to the first one
			continue;

		//assign sampler
		sampler = this.textures[ channel ];
		if(!sampler)
			sampler = this.textures[channel] = { texture: texture, uvs: "0", wrap: 0, minFilter: 0, magFilter: 0 }; //sampler

		if(sampler_options)
			for(var i in sampler_options)
				sampler[i] = sampler_options[i];

		prop.value = prop.type == "sampler" ? sampler : texture;
		break;
	}

	//preload texture
	if(texture && texture.constructor == String && texture[0] != ":")
		LS.ResourcesManager.load( texture );

	return sampler;
}

/**
* Collects all the resources needed by this material (textures)
* @method getResources
* @param {Object} resources object where all the resources are stored
* @return {Texture}
*/
SurfaceMaterial.prototype.getResources = function (res)
{
	for(var i = 0, l = this.properties.length; i < l; ++i )
	{
		var prop = this.properties[i];
		if(prop.type != "texture" && prop.type != "cubemap" && prop.type != "sampler")
			continue;
		if(!prop.value)
			continue;

		var texture = prop.type == "sampler" ? prop.value.texture : prop.value;
		if( typeof( texture ) == "string" )
			res[ texture ] = GL.Texture;
	}

	return res;
}


LS.registerMaterialClass( SurfaceMaterial );
LS.SurfaceMaterial = SurfaceMaterial;
/*
	A component container is someone who could have components attached to it.
	Mostly used for SceneNodes but it could be used for other classes (like SceneTree or Project).
*/

/**
* ComponentContainer class allows to add component based properties to any other class
* @class ComponentContainer
* @constructor
*/
function ComponentContainer()
{
	//this function never will be called (because only the methods are attached to other classes)
	//unless you instantiate this class directly, something that would be weird
	this._components = [];
	this._missing_components = null; //here we store info about components with missing info
	//this._components_by_uid = {}; //TODO
}


/**
* Adds a component to this node.
* @method configureComponents
* @param {Object} info object containing all the info from a previous serialization
*/

ComponentContainer.prototype.configureComponents = function(info)
{
	if(info.components)
		for(var i = 0, l = info.components.length; i < l; ++i)
		{
			var comp_info = info.components[i];
			var comp_class = comp_info[0];
			if(comp_class == "Transform" && i == 0) //special case: this is the only component that comes by default
			{
				this.transform.configure(comp_info[1]);
				continue;
			}
			var classObject = LS.Components[comp_class];
			if(!classObject){
				console.error("Unknown component found: " + comp_class);
				if(!this._missing_components)
					this._missing_components = [];
				this._missing_components.push( comp_info );
				continue;
			}
			var comp = new LS.Components[comp_class]( comp_info[1] );
			this.addComponent(comp);
		}
}

/**
* Adds a component to this node.
* @method serializeComponents
* @param {Object} o container where the components will be stored
*/

ComponentContainer.prototype.serializeComponents = function(o)
{
	if(!this._components)
		return;

	o.components = [];
	for(var i = 0, l = this._components.length; i < l; ++i)
	{
		var comp = this._components[i];
		if( !comp.serialize )
			continue;
		var obj = comp.serialize();

		//enforce uid storage
		if(comp.hasOwnProperty("uid") && !obj.uid)
			obj.uid = comp.uid;

		o.components.push([LS.getObjectClassName(comp), obj]);
	}

	if(this._missing_components && this._missing_components.length)
		o.components = o.components.concat( this._missing_components );
}

/**
* returns an array with all the components
* @method getComponents
* @return {Array} all the components
*/
ComponentContainer.prototype.getComponents = function( class_type )
{
	if(class_type)
	{
		var result = [];
		if(class_type.constructor === String)
			class_type = LS.Components[class_type];
		for(var i = 0, l = this._components.length; i < l; ++i)
		{
			var compo = this._components[i];
			if( compo.constructor === class_type )
				result.push( compo );
		}
		return result;
	}

	return this._components;
}

/**
* Adds a component to this node. (maybe attach would been a better name)
* @method addComponent
* @param {Object} component
* @return {Object} component added
*/
ComponentContainer.prototype.addComponent = function( component, index )
{
	if(!component)
		throw("addComponent cannot receive null");

	//link component with container
	component._root = this;

	//not very clean, ComponetContainer shouldnt know about LS.SceneNode, but this is more simple
	if(this.constructor == LS.SceneNode && component.onAddedToNode)
		component.onAddedToNode(this);

	if( (this._in_tree || this.constructor == LS.SceneTree) && component.onAddedToScene)
		component.onAddedToScene( this.constructor == LS.SceneTree ? this : this._in_tree );

	//link node with component
	if(!this._components) 
		Object.defineProperty( this, "_components", { value: [], enumerable: false });
	if(this._components.indexOf(component) != -1)
		throw("inserting the same component twice");

	if(index !== undefined && index <= this._components.length )
		this._components.splice(index,0,component);
	else
		this._components.push( component );

	if( !component.uid )
		component.uid = LS.generateUId("COMP-");

	return component;
}

/**
* Removes a component from this node.
* @method removeComponent
* @param {Object} component
*/
ComponentContainer.prototype.removeComponent = function(component)
{
	if(!component)
		throw("removeComponent cannot receive null");

	//unlink component with container
	component._root = null;

	//not very clean, ComponetContainer shouldnt know about LS.SceneNode, but this is more simple
	if(this.constructor == LS.SceneNode && component.onRemovedFromNode)
		component.onRemovedFromNode(this);

	if((this._in_tree || this.constructor == LS.SceneTree) && component.onRemovedFromScene)
		component.onRemovedFromScene( this.constructor == LS.SceneTree ? this : this._in_tree );

	//remove all events
	LEvent.unbindAll(this,component);

	//remove from components list
	var pos = this._components.indexOf(component);
	if(pos != -1)
		this._components.splice(pos,1);
}

/**
* Removes all components from this node.
* @method removeAllComponents
* @param {Object} component
*/
ComponentContainer.prototype.removeAllComponents = function()
{
	while(this._components.length)
		this.removeComponent( this._components[0] );
	this._missing_components = null;
}


/**
* Returns if the class has an instance of this component
* @method hasComponent
* @param {bool}
*/
ComponentContainer.prototype.hasComponent = function(component_class) //class, not string with the name of the class
{
	if(!this._components)
		return false;

	//string
	if( component_class.constructor === String)
	{
		for(var i = 0, l = this._components.length; i < l; ++i)
			if( this._components[i].constructor.name == component_class )
			return true;
		return false;
	}

	//class
	for(var i = 0, l = this._components.length; i < l; ++i)
		if( this._components[i].constructor === component_class )
		return true;
	return false;
}


/**
* Returns the first component of this container that is of the same class
* @method getComponent
* @param {Object|String} component_class the class to search a component from (could be the class or the name)
* @param {Number} index [optional] if you want the Nth component of this class
*/
ComponentContainer.prototype.getComponent = function( component_class, index )
{
	if(!this._components || !component_class)
		return null;

	if( component_class.constructor === String )
	{
		component_class = LS.Components[ component_class ];
		if(!component_class)
			return;
	}

	for(var i = 0, l = this._components.length; i < l; ++i)
	{
		if( this._components[i].constructor === component_class )
		{
			if(index !== undefined && index > 0)
			{
				index--;
				continue;
			}
			return this._components[i];
		}
	}
	return null;
}

/**
* Returns the component with the given uid
* @method getComponentByUId
* @param {string} uid the uid to search 
*/
ComponentContainer.prototype.getComponentByUId = function(uid)
{
	if(!this._components)
		return null;
	for(var i = 0, l = this._components.length; i < l; ++i)
		if( this._components[i].uid == uid )
			return this._components[i];
	return null;
}

/**
* Returns the position in the components array of this component
* @method getIndexOfComponent
* @param {Number} position in the array, -1 if not found
*/
ComponentContainer.prototype.getIndexOfComponent = function(component)
{
	if(!this._components)
		return -1;
	return this._components.indexOf( component );
}

/**
* Returns the component at index position
* @method getComponentByIndex
* @param {Object} component
*/
ComponentContainer.prototype.getComponentByIndex = function(index)
{
	if(!this._components)
		return null;
	return this._components[index];
}

/**
* Changes the order of a component
* @method setComponentIndex
* @param {Object} component
*/
ComponentContainer.prototype.setComponentIndex = function( component, index )
{
	if(!this._components)
		return null;
	if(index < 0)
		index = 0;
	var old_index = this._components.indexOf( component );
	if (old_index == -1)
		return;

	this._components.splice( old_index, 1 );

	/*
	if(index >= old_index)
		index--; 
	*/
	if(index >= this._components.length)
		this._components.push( component );
	else
		this._components.splice( index, 0, component );

}


/**
* executes the method with a given name in all the components
* @method processActionInComponents
* @param {String} action_name the name of the function to execute in all components (in string format)
* @param {Array} params array with every parameter that the function may need
*/
ComponentContainer.prototype.processActionInComponents = function(action_name,params)
{
	if(!this._components)
		return;
	for(var i = 0, l = this._components.length; i < l; ++i)
	{
		var comp = this._components[i];
		if( !comp[action_name] || comp[action_name].constructor !== Function )
			continue;

		if(!params || params.constructor !== Array)
			comp[action_name].call(comp, params);
		else
			comp[action_name].apply(comp, params);
	}
}


//TODO: a class to remove the tree methods from SceneTree and SceneNode
/**
* CompositePattern implements the Composite Pattern, which allows to one class to contain instances of its own class
* creating a tree-like structure.
* @class CompositePattern
* @constructor
*/
function CompositePattern()
{
	//WARNING! do not add anything here, it will never be called
}

CompositePattern.prototype.compositeCtor = function()
{
}

/* use .scene instead
CompositePattern.prototype.getScene = function()
{
	this._in_tree;
}
*/

/**
* Adds one child to this instance
* @method addChild
* @param {*} child
* @param {number} index [optional]  in which position you want to insert it, if not specified it goes to the last position
* @param {*} options [optional] data to be passed when adding it, used for special cases when moving nodes around
**/

CompositePattern.prototype.addChild = function(node, index, options)
{
	if(!node)
		throw("cannot addChild of null");

	//be careful with weird recursions...
	var aux = this;
	while( aux._parentNode )
	{
		if(aux == node)
			throw("addChild: Cannot insert a node as his own child");
		aux = aux._parentNode;
	}

	//has a parent
	if(node._parentNode)
		node._parentNode.removeChild(node, options);

	/*
	var moved = false;
	if(node._parentNode)
	{
		moved = true;
		node._onChangeParent(this, options);
		//remove from parent children
		var pos = node._parentNode._children.indexOf(node);
		if(pos != -1)
			node._parentNode._children.splice(pos,1);
	}
	*/

	//attach to this
	node._parentNode = this;
	if( !this._children )
		this._children = [node];
	else if(index == undefined)
		this._children.push(node);
	else
		this._children.splice(index,0,node);

	//the same as scene but we called tree to make it more generic
	var tree = this._in_tree;

	//this would never fire but just in case
	if(tree && node._in_tree && node._in_tree != tree)
		throw("Cannot add a node that belongs to another scene tree");

	//Same tree
	node._in_tree = tree;

	//overwritten from SceneNode
	if(this._onChildAdded)
		this._onChildAdded(node, options);

	LEvent.trigger(this,"childAdded", node);
	if(tree)
	{
		//added to scene tree
		LEvent.trigger(tree, "treeItemAdded", node);
		inner_recursive(node);
	}

	//recursive action
	function inner_recursive(item)
	{
		if(!item._children) return;
		for(var i in item._children)
		{
			var child = item._children[i];
			if(!child._in_tree)
			{
				//added to scene tree
				LEvent.trigger( tree, "treeItemAdded", child );
				child._in_tree = tree;
			}
			inner_recursive( child );
		}
	}
}

/**
* Removes the node from its parent (and from the scene tree)
*
* @method removeChild
* @param {Node} node this child to remove
* @param1 {*} param1 data passed to onChildRemoved
* @param2 {*} param2 data passed to onChildRemoved as second parameter
* @return {Boolean} returns true if it was found and removed
*/
CompositePattern.prototype.removeChild = function(node, param1, param2)
{
	if(!node)
		throw("cannot removeChild of null");

	if(!this._children || node._parentNode != this)
		return false;
	if( node._parentNode != this)
		return false; //not his son
	var pos = this._children.indexOf(node);
	if(pos == -1)
		return false; //not his son ¿?
	this._children.splice(pos,1);

	if(this._onChildRemoved)
		this._onChildRemoved(node, param1, param2);

	LEvent.trigger(this,"childRemoved", node);

	if(node._in_tree)
	{
		LEvent.trigger(node._in_tree, "treeItemRemoved", node);
		//propagate to childs
		inner_recursive(node);
	}
	node._in_tree = null;

	//recursive action to remove tree
	function inner_recursive(item)
	{
		if(!item._children)
			return;
		for(var i = 0, l = item._children.length; i < l; ++i)
		{
			var child = item._children[i];
			if(child._in_tree)
			{
				LEvent.trigger( child._in_tree, "treeItemRemoved", child );
				child._in_tree = null;
			}
			inner_recursive( child );
		}
	}

	return true;
}


/**
* Remove every child node
*
* @method removeAllChildren
*/
CompositePattern.prototype.removeAllChildren = function(param1, param2)
{
	if(this._children)
		while( this._children.length )
			this.removeChild( this._children[0], param1, param2 );
}


/**
* Remove node from parent
*
* @method destroy
*/
CompositePattern.prototype.destroy = function()
{
	if(this._parentNode)
		this._parentNode.removeChild( this );
}


/**
* Serialize the data from all the children
*
* @method serializeChildren
* @return {Array} array containing all serialized data from every children
*/
CompositePattern.prototype.serializeChildren = function()
{
	var r = [];
	if(this._children)
		for(var i in this._children)
			r.push( this._children[i].serialize() ); //serialize calls serializeChildren
	return r;
}

/**
* Configure every children with the data
*
* @method configureChildren
* @return {Array} o array containing all serialized data 
*/
CompositePattern.prototype.configureChildren = function(o)
{
	if(!o.children) return;

	for(var i in o.children)
	{
		var c = o.children[i];

		//create instance
		var node = new this.constructor(c.id); //id is hardcoded...
		//this is important because otherwise the event fired by addChild wont have uid info which is crucial in some cases
		if(c.uid) 
			node.uid = c.uid;
		//add before configure, so every child has a scene tree
		this.addChild(node);
		//we configure afterwards otherwise children wouldnt have a scene tree to bind anything
		node.configure(c);
	}
}

/**
* Returns parent node
*
* @method getParent
* @return {SceneNode} parent node
*/
CompositePattern.prototype.getParent = function()
{
	return this._parentNode;
}

CompositePattern.prototype.getChildren = function()
{
	return this._children || [];
}

CompositePattern.prototype.getChildIndex = function( child )
{
	return this._children ? this._children.indexOf( child ) : -1;
}

CompositePattern.prototype.getChildByIndex = function( index )
{
	return this._children && this._children.length > index ? this._children[ index ] : null;
}

CompositePattern.prototype.getChildByName = function( name )
{
	if(!this._children)
		return null;

	for(var i = 0; i < this._children.length; ++i)
		if(this._children[i].name == name )
			return this._children[i];
}

CompositePattern.prototype.getPathName = function()
{
	if(!this._in_tree)
		return null;

	if(this === this._in_tree.root )
		return "";

	var path = this.name;
	var parent = this.parentNode;
	while(parent)
	{
		if(parent === this._in_tree.root )
			return path;
		path = parent.name + "|" + path;
		parent = parent.parentNode;
	}
	return null;
}

/*
CompositePattern.prototype.childNodes = function()
{
	return this._children || [];
}
*/

//DOM style
Object.defineProperty( CompositePattern.prototype, "childNodes", {
	enumerable: true,
	get: function() {
		return this._children || [];
	},
	set: function(v) {
		//TODO
	}
});

Object.defineProperty( CompositePattern.prototype, "parentNode", {
	enumerable: true,
	get: function() {
		return this._parentNode;
	},
	set: function(v) {
		//TODO
	}
});

Object.defineProperty( CompositePattern.prototype, "scene", {
	enumerable: true,
	get: function() {
		return this._in_tree;
	},
	set: function(v) {
		throw("Scene cannot be set, you must use addChild in parent");
	}
});

/**
* get all nodes below this in the hierarchy (children and children of children)
*
* @method getDescendants
* @return {Array} array containing all descendants
*/
CompositePattern.prototype.getDescendants = function()
{
	if(!this._children || this._children.length == 0)
		return [];
	var r = this._children.concat();
	for(var i = 0;  i < this._children.length; ++i)
		r = r.concat( this._children[i].getDescendants() );
	return r;
}

//search for a node using a string that could be a name, a fullname or a uid
CompositePattern.prototype.findNode = function( name_or_uid )
{
	if(name_or_uid == "")
		return this;
	if(!name_or_uid)
		return null;
	if(name_or_uid.charAt(0) != LS._uid_prefix)
		return this.findNodeByName( name_or_uid );
	return this.findNodeByUId( name_or_uid );
}

//this function gets called a lot when using animations
CompositePattern.prototype.findNodeByName = function( name )
{
	if(!name)
		return null;

	if(this.name == name)
		return this;

	var children = this._children;

	if(children)
	{
		for(var i = 0, l = children.length; i < l; ++i)
		{
			var node = children[i];
			if( node.name == name )
				return node;
			if(node._children)
			{
				var r = node.findNodeByName( name );
				if(r)
					return r;
			}
		}
	}
	return null;
}

CompositePattern.prototype.findNodeByUId = function( uid )
{
	if(!uid)
		return null;

	if(this.uid == uid)
		return this;

	var children = this._children;

	if(children)
		for(var i = 0; i < children.length; ++i)
		{
			var node = children[i];
			if( node.uid == uid )
				return node;
			if(node._children)
			{
				var r = node.findNodeByUId(uid);
				if(r)
					return r;
			}
		}
	return null;
}




/*
*  Components are elements that attach to Nodes or other objects to add functionality
*  Some important components are Transform, Light or Camera
*
*	*  ctor: must accept an optional parameter with the serialized data
*	*  onAddedToNode: triggered when added to node
*	*  onRemovedFromNode: triggered when removed from node
*	*  onAddedToScene: triggered when the node is added to the scene
*	*  onRemovedFromScene: triggered when the node is removed from the scene
*	*  serialize: returns a serialized version packed in an object
*	*  configure: recieves an object to unserialize and configure this instance
*	*  getResources: adds to the object the resources to load
*	*  _root contains the node where the component is added
*
*	*  use the LEvent system to hook events to the node or the scene
*	*  never share the same component instance between two nodes
*
*/

/**
* This is an example class for a component, should never be instantiated by itself, 
* instead components get all the methods from this class attached when the component is registered.
* Components can overwrite this methods if they want.
*
* @class  Component
* @namespace  LS
*/
function Component(o)
{
	if(o)
		this.configure(o);
}

//default methods inserted in components that doesnt have a configure or serialize method
Component.prototype.configure = function(o)
{ 
	if(!o)
		return;
	if(o.uid) 
		this.uid = o.uid;
	/*
	{
		//special case, uid must never be enumerable to avoid showing it in the editor
		if(this.uid === undefined && !Object.hasOwnProperty(this, "uid"))
		{
			this._uid = o.uid;

			Object.defineProperty(this, "uid", { 
				set: o.uid, 
				enumerable: false,
				writable: true
			});
		}
		else
			this.uid = o.uid;
	}
	*/
	LS.cloneObject(o, this, false, true); 
}

Component.prototype.serialize = function()
{
	var o = LS.cloneObject(this);
	if(this.uid) //special case, not enumerable
		o.uid = this.uid;
	return o;
}

/**
* Create a clone of this node (the UID is removed to avoid collisions)
* @method clone
**/
Component.prototype.clone = function()
{
	var data = this.serialize();
	data.uid = null; //remove id when cloning
	var new_component = new this.constructor( data );
	return new_component;
}

/**
* To create a new property for this component adding some extra useful info to help the editor
* @method createProperty
* @param {String} name the name of the property as it will be accessed
* @param {*} value the value to assign by default to this property
* @param {String|Object} type [optional] an string identifying the type of the variable, could be "number","string","Texture","vec3","mat4", or an object with all the info
* @param {Function} setter [optional] setter function, otherwise one will be created
* @param {Function} getter [optional] getter function, otherwise one will be created
**/
Component.prototype.createProperty = function( name, value, type, setter, getter )
{
	if(type)
	{
		//control errors
		if(type == "String" || type == "Number" || type == "Boolean")
		{
			console.warn("createProperty: Basic types must be in lowercase -> " + type );
			type = type.toLowerCase();
		}

		if( typeof(type) == "object" )
			this.constructor[ "@" + name ] = type;
		else
			this.constructor[ "@" + name ] = { type: type };
	}

	//basic type
	if( (value.constructor === Number || value.constructor === String || value.constructor === Boolean) && !setter && !getter )
	{
		this[ name ] = value;
		return;
	}

	var private_name = "_" + name;

	//vector type has special type with setters and getters to avoid overwritting
	if(value.constructor === Float32Array)
	{
		value = new Float32Array( value ); //clone
		this[ private_name ] = value; //this could be removed...

		//create setter
		Object.defineProperty( this, name, {
			get: getter || function() { return value; },
			set: setter || function(v) { value.set( v ); },
			enumerable: true
		});
	}
	else
	{
		//define private
		Object.defineProperty( this, private_name, { 
			value: value, 
			enumerable: false
		});

		//define public
		Object.defineProperty( this, name, {
			get: getter || function() { return this[ private_name ]; },
			set: setter || function(v) { this[ private_name ] = v; },
			enumerable: true
		});
	}
}

//not finished
Component.prototype.createAction = function( name, callback, options )
{
	this[name] = callback;
	this.constructor["@" + name ] = options || { button_text:"trigger", type:"button", callback: callback };
}


/**
* Returns the locator string of this component
* @method getLocator
* @return {String} the locator string of this component
**/
Component.prototype.getLocator = function()
{
	if(!this._root)
		return "";
	return this._root.uid + "/" + this.uid;
}

/**
* Bind one object event to a method in this component
* @method bind
* @param {*} object the dispatcher of the event you want to react to
* @param {String} event the name of the event to bind to
* @param {Function} callback the callback to call
* @param {String|Object} type [optional] an string identifying the type of the variable, could be "number","string","Texture","vec3","mat4", or an object with all the info
* @param {Function} setter [optional] setter function, otherwise one will be created
* @param {Function} getter [optional] getter function, otherwise one will be created
**/
Component.prototype.bind = function( object, method, callback )
{
	var instance = this;
	if(arguments.length > 3 )
	{
		console.error("Component.bind cannot use a fourth parameter, all callbacks will be binded to the component");
		return;
	}

	if(!object)
	{
		console.error("Cannot bind to null.");
		return;
	}

	if(!callback)
	{
		console.error("You cannot bind a method before defining it.");
		return;
	}

	/*
	var found = false;
	for(var i in this)
	{
		if(this[i] == callback)
		{
			found = true;
			break;
		}
	}
	if(!found)
		console.warn("Callback function not found in this object, this is dangerous, remember to unbind it manually or use LEvent instead.");
	*/

	//store info about which objects have events pointing to this instance
	if(!this.__targeted_instances)
		Object.defineProperty( this,"__targeted_instances", { value: [], enumerable: false, writable: true });
	var index = this.__targeted_instances.indexOf( object );
	if(index == -1)
		this.__targeted_instances.push( object );

	return LEvent.bind( object, method, callback, instance );
}

Component.prototype.unbind = function( object, method, callback )
{
	var instance = this;

	var r = LEvent.unbind( object, method, callback, instance );

	//erase from targeted instances
	if( this.__targeted_instances )
	{
		if( !LEvent.hasBindTo( object, this ) )
			return r;

		var index = this.__targeted_instances.indexOf( object );
		if(index == -1)
			this.__targeted_instances.splice( index, 1 );
		if(this.__targeted_instances.length == 0)
			delete this.__targeted_instances;
	}

	return r;
}

Component.prototype.unbindAll = function()
{
	if( !this.__targeted_instances )
		return;

	for( var i = 0; i < this.__targeted_instances.length; ++i )
		LEvent.unbindAll( this.__targeted_instances[i], this );
	this.__targeted_instances = null; //delete dont work??
}

//called by register component to add setters and getters to registered Component Classes
Component.addExtraMethods = function( component )
{
	//add uid property
	Object.defineProperty( component.prototype, 'uid', {
		set: function( uid )
		{
			if(!uid)
				return;

			if(uid[0] != LS._uid_prefix)
			{
				console.warn("Invalid UID, renaming it to: " + uid );
				uid = LS._uid_prefix + uid;
			}

			if(uid == this._uid)
				return;
			//if( this._root && this._root._components_by_uid[ this.uid ] )
			//	delete this._root && this._root._components_by_uid[ this.uid ];
			this._uid = uid;
			//if( this._root )
			//	this._root && this._root._components_by_uid[ this.uid ] = this;
		},
		get: function(){
			return this._uid;
		},
		enumerable: false //uid better not be enumerable (so it doesnt show in the editor)
	});

	Object.defineProperty( component.prototype, 'root', {
		set: function( uid )
		{
			throw("root cannot be set, call addComponent to the root");
		},
		get: function(){
			return this._root;
		},
		enumerable: false //uid better not be enumerable (so it doesnt show in the editor)
	});
};




LS.Component = Component;
/** Transform that contains the position (vec3), rotation (quat) and scale (vec3) 
* @class Transform
* @constructor
* @param {Object} object to configure from
*/

function Transform( o )
{
	//packed data (helpful for animation stuff)
	this._data = new Float32Array( 3 + 4 + 3 ); //pos, rot, scale

	this._position = this._data.subarray(0,3);

	this._rotation = this._data.subarray(3,7);
	quat.identity(this._rotation);

	this._scaling = this._data.subarray(7,10);
	this._scaling[0] = this._scaling[1] = this._scaling[2] = 1;

	this._local_matrix = mat4.create();
	this._global_matrix = mat4.create();

	this._must_update_matrix = false; //matrix must be redone?

	/* deprecated
	if(Object.observe)
	{
		var inner_transform_change = (function(c) { 
			this._must_update_matrix = true;
		}).bind(this);
		Object.observe( this._position, inner_transform_change );
		Object.observe( this._rotation, inner_transform_change );
		Object.observe( this._scaling, inner_transform_change );
		Object.observe( this._data, inner_transform_change );
	}
	*/

	if(o)
		this.configure(o);
}

Transform.temp_matrix = mat4.create();
Transform.icon = "mini-icon-gizmo.png";
Transform.ZERO = vec3.create();
Transform.UP = vec3.fromValues(0,1,0);
Transform.RIGHT = vec3.fromValues(1,0,0);
Transform.FRONT = vec3.fromValues(0,0,-1);


Transform["@position"] = { type: "position"};
Transform["@rotation"] = { type: "quat"};

Transform.properties = {
	position:"vec3",
	scaling:"vec3",
	rotation:"quat"
};

Transform.prototype.onAddedToNode = function(node)
{
	if(!node.transform)
		node.transform = this;
}

Transform.prototype.onRemovedFromNode = function(node)
{
	if(node.transform == this)
		delete node["transform"];
}

/**
* The position relative to its parent in vec3 format
* @property position {vec3}
*/
Object.defineProperty( Transform.prototype, 'position', {
	get: function() { return this._position; },
	set: function(v) { 
		this._position.set(v); 
		this._must_update_matrix = true; 
	},
	enumerable: true
});

Object.defineProperty( Transform.prototype, 'x', {
	get: function() { return this._position[0]; },
	set: function(v) { 
		this._position[0] = v; 
		this._must_update_matrix = true; 
	},
	enumerable: false
});

Object.defineProperty( Transform.prototype, 'y', {
	get: function() { return this._position[1]; },
	set: function(v) { 
		this._position[1] = v; 
		this._must_update_matrix = true; 
	},
	enumerable: false
});

Object.defineProperty( Transform.prototype, 'z', {
	get: function() { return this._position[2]; },
	set: function(v) { 
		this._position[2] = v; 
		this._must_update_matrix = true; 
	},
	enumerable: false
});

/*
Object.defineProperty( Transform.prototype, 'pitch', {
	get: function() { return 0; },
	set: function(v) { 
		this.rotateX(v);
		this._must_update_matrix = true; 
	},
	enumerable: false
});
*/

/**
* The orientation relative to its parent in quaternion format
* @property rotation {quat}
*/
Object.defineProperty( Transform.prototype, 'rotation', {
	get: function() { return this._rotation; },
	set: function(v) { 
		this._rotation.set(v);
		this._must_update_matrix = true;
	},
	enumerable: true //avoid problems
});

/**
* The scaling relative to its parent in vec3 format (default is [1,1,1])
* @property scaling {vec3}
*/
Object.defineProperty( Transform.prototype, 'scaling', {
	get: function() { return this._scaling; },
	set: function(v) { 
		if(v.constructor === Number)
			this._scaling[0] = this._scaling[1] = this._scaling[2] = v;
		else
			this._scaling.set(v);
		this._must_update_matrix = true;
	},
	enumerable: true
});

/**
* The local matrix transform relative to its parent in mat4 format
* @property matrix {mat4}
*/
Object.defineProperty( Transform.prototype, 'matrix', {
	get: function() { 
		if(this._must_update_matrix)
			this.updateMatrix();
		return this._local_matrix;
	},
	set: function(v) { 
		this.fromMatrix(v);	
	},
	enumerable: true
});

//this is used to speed up copying between transforms and for animation (better to animate one track than several)
Object.defineProperty( Transform.prototype, 'data', {
	get: function() { 
		return this._data;
	},
	set: function(v) { 
		this._data.set(v);	
		this._must_update_matrix = true;
	},
	enumerable: false
});

Object.defineProperty( Transform.prototype, 'xrotation', {
	get: function() { return 0; },
	set: function(v) { 
		this.rotateX(v * DEG2RAD);
		//this._rotation[0] = Math.sin(v * DEG2RAD * 0.5);
		//quat.normalize(this._rotation,this._rotation);
		//this._must_update_matrix = true; 
	},
	enumerable: false
});
Object.defineProperty( Transform.prototype, 'yrotation', {
	get: function() { return 0; },
	set: function(v) { 
		this.rotateY(v * DEG2RAD);
		//this._rotation[1] = Math.sin(v * DEG2RAD * 0.5);
		//quat.normalize(this._rotation,this._rotation);
		//this._must_update_matrix = true; 
	},
	enumerable: false
});
Object.defineProperty( Transform.prototype, 'zrotation', {
	get: function() { return 0; },
	set: function(v) { 
		this.rotateZ(v * DEG2RAD);
		//this._rotation[2] = Math.sin(v * DEG2RAD * 0.5);
		//quat.normalize(this._rotation,this._rotation);
		//this._must_update_matrix = true; 
	},
	enumerable: false
});



/**
* The position relative to its parent in vec3 format
* @property position {vec3}
*/
Object.defineProperty( Transform.prototype, 'globalPosition', {
	get: function() { return this.getGlobalPosition(); },
	set: function(v) { 
	},
	enumerable: true
});

/**
* The local matrix transform relative to its parent in mat4 format
* @property matrix {mat4}
*/
Object.defineProperty( Transform.prototype, 'globalMatrix', {
	get: function() { 
		this.updateGlobalMatrix();
		return this._global_matrix;
	},
	set: function(v) { 
	},
	enumerable: true
});

/**
* Force object to update matrices
* @property mustUpdate {boolean}
*/
Object.defineProperty( Transform.prototype, 'mustUpdate', {
	get: function() { 
		return this._must_update_matrix;
	},
	set: function(v) { 
		this._must_update_matrix = true;
	},
	enumerable: false
});

Transform.prototype.getProperties = function(v)
{
	if(v == "output")
	{
		return {
			position:"vec3",
			scaling:"vec3",
			rotation:"quat",
			matrix:"mat4",
			globalPosition:"vec3",
			globalMatrix:"mat4"
		};
	} 
	else //if(v == "input")
	{
		return {
			position:"vec3",
			scaling:"vec3",
			rotation:"quat",
			matrix:"mat4"
		};
	}
}


/**
* Copy the transform from another Transform
* @method copyFrom
* @param {Transform} src
*/
Transform.prototype.copyFrom = function(src)
{
	this.configure( src.serialize() );
}

/**
* Configure from a serialized object
* @method configure
* @param {Object} object with the serialized info
*/
Transform.prototype.configure = function(o)
{
	if(o.uid) this.uid = o.uid;
	if(o.position) this._position.set( o.position );
	if(o.scaling) this._scaling.set( o.scaling );

	if(o.rotation && o.rotation.length == 4)
		this._rotation.set( o.rotation );
	if(o.rotation && o.rotation.length == 3)
	{
		quat.identity( this._rotation );
		var R = quat.setAngleAxis( quat.create(), [1,0,0], o.rotation[0] * DEG2RAD);
		quat.multiply(this._rotation, this._rotation, R ); 
		quat.setAngleAxis( R, [0,1,0], o.rotation[1] * DEG2RAD );
		quat.multiply(this._rotation, this._rotation, R ); 
		quat.setAngleAxis( R, [0,0,1], o.rotation[2] * DEG2RAD );
		quat.multiply(this._rotation, this._rotation, R ); 
	}

	this._must_update_matrix = true;
	this.updateGlobalMatrix();
	this._on_change();
}

/**
* Serialize the object 
* @method serialize
* @return {Object} object with the serialized info
*/
Transform.prototype.serialize = function()
{
	return {
		uid: this.uid,
		position: [ this._position[0],this._position[1],this._position[2] ],
		rotation: [ this._rotation[0],this._rotation[1],this._rotation[2],this._rotation[3] ],
		scaling: [ this._scaling[0],this._scaling[1],this._scaling[2] ],
		matrix: toArray( this._local_matrix ) //could be useful
	};
}

/**
* Reset this transform
* @method identity
*/
Transform.prototype.identity = function()
{
	vec3.copy(this._position, [0,0,0]);
	quat.copy(this._rotation, [0,0,0,1]);
	vec3.copy(this._scaling, [1,1,1]);
	mat4.identity(this._local_matrix);
	mat4.identity(this._global_matrix);
	this._must_update_matrix = false;
}

Transform.prototype.reset = Transform.prototype.identity;

/**
* Returns a copy of the local position
* @method getPosition
* @param {vec3} out [optional] where to store the result, otherwise one vec3 is created and returned
* @return {vec3} the position
*/
Transform.prototype.getPosition = function(out)
{
	out = out || vec3.create();
	out.set( this._position );
	return out;
}

/**
* Returns a copy of the global position
* @method getGlobalPosition
* @param {vec3} out [optional] where to store the result, otherwise one vec3 is created and returned
* @return {vec3} the position
*/
Transform.prototype.getGlobalPosition = function(out)
{
	out = out || vec3.create();
	if(this._parent)
		return mat4.multiplyVec3( out, this.getGlobalMatrix(), Transform.ZERO );
	return vec3.copy(out, this._position );
}

/**
* Returns the rotation in quaternion array (a copy)
* @method getRotation
* @param {quat} out [optional] where to store the result, otherwise one quat is created and returned
* @return {quat} the rotation
*/
Transform.prototype.getRotation = function(out)
{
	out = out || quat.create();
	return vec3.copy(out,this._rotation);
}

/**
* Returns the global rotation in quaternion array (a copy)
* @method getRotation
* @param {quat} out [optional] where to store the result, otherwise one quat is created and returned
* @return {quat} the rotation
*/
Transform.prototype.getGlobalRotation = function(out)
{
	out = out || quat.create();
	if( !this._parent )
	{
		quat.copy(out, this._rotation);
		return out;
	}

	var aux = this._parent;
	quat.copy(out,this._rotation);
	while(aux)
	{
		quat.multiply(out, aux._rotation, out);
		aux = aux._parent;
	}
	return out;
}


/**
* Returns the scale (its a copy)
* @method getScale
* @param {vec3} out [optional] where to store the result, otherwise one vec3 is created and returned
* @return {vec3} the scale
*/
Transform.prototype.getScale = function(out)
{
	out = out || vec3.create();
	return vec3.copy(out,this._scaling);
}

/**
* Returns a copy of the global scale (this is not correct, there is no global_scale factor, because due to rotations the axis could change)
* @method getGlobalScale
* @param {vec3} out [optional] where to store the result, otherwise one vec3 is created and returned
* @return {vec3} the scale
*/
Transform.prototype.getGlobalScale = function(out)
{
	out = out || vec3.create();
	if( this._parent )
	{
		var aux = this;
		vec3.copy(out,this._scaling);
		while(aux._parent)
		{
			vec3.multiply(out, out, aux._scaling);
			aux = aux._parent;
		}
		return out;
	}
	return vec3.copy(out, this._scaling);
}

/**
* update the local Matrix to match the position,scale and rotation
* @method updateMatrix
*/
Transform.prototype.updateMatrix = function()
{
	mat4.fromRotationTranslation( this._local_matrix , this._rotation, this._position );
	mat4.scale(this._local_matrix, this._local_matrix, this._scaling);
	this._must_update_matrix = false;
}
Transform.prototype.updateLocalMatrix = Transform.prototype.updateMatrix;

/**
* updates the global matrix using the parents transformation
* @method updateGlobalMatrix
* @param {bool} fast it doesnt recompute parent matrices, just uses the stored one, is faster but could create errors if the parent doesnt have its global matrix update
*/
Transform.prototype.updateGlobalMatrix = function (fast)
{
	if(this._must_update_matrix)
		this.updateMatrix();
	if (this._parent)
		mat4.multiply( this._global_matrix, fast ? this._parent._global_matrix : this._parent.getGlobalMatrix( this._parent._global_matrix ), this._local_matrix );
	else
		this._global_matrix.set( this._local_matrix ); 
}

/**
* Returns a copy of the local matrix of this transform (it updates the matrix automatically)
* @method getMatrix
* @param {mat4} out [optional] where to store the result, otherwise one mat4 is created and returned
* @return {mat4} the matrix
*/
Transform.prototype.getMatrix = function (out)
{
	out = out || mat4.create();
	if(this._must_update_matrix)
		this.updateMatrix();
	return mat4.copy(out, this._local_matrix);
}
Transform.prototype.getLocalMatrix = Transform.prototype.getMatrix; //alias

/**
* Returns the original local matrix of this transform (it updates the matrix automatically)
* @method getLocalMatrixRef
* @return {mat4} the matrix in array format
*/
Transform.prototype.getLocalMatrixRef = function ()
{
	if(this._must_update_matrix)
		this.updateMatrix();
	return this._local_matrix;
}


/**
* Returns a copy of the global matrix of this transform (it updates the matrix automatically)
* @method getGlobalMatrix
* @param {mat4} out optional
* @param {boolean} fast this flags skips recomputing parents matrices
* @return {mat4} the matrix in array format
*/
Transform.prototype.getGlobalMatrix = function (out, fast)
{
	if(this._must_update_matrix)
		this.updateMatrix();
	out = out || mat4.create();
	if (this._parent)
		mat4.multiply( this._global_matrix, fast ? this._parent._global_matrix : this._parent.getGlobalMatrix( this._parent._global_matrix ), this._local_matrix );
	else
		mat4.copy( this._global_matrix, this._local_matrix ); 
	return mat4.copy(out, this._global_matrix);
}

/**
* Returns a copy of the global matrix of this transform (it updates the matrix automatically)
* @method getGlobalMatrix
* @return {mat4} the matrix in array format
*/
Transform.prototype.getGlobalMatrixRef = function ()
{
	this.updateGlobalMatrix();
	return this._global_matrix;
}



/**
* Returns an array with all the ancestors
* @method getAncestors
* @return {Array} 
*/
Transform.prototype.getAncestors = function()
{
	var r = [ this ];
	var aux = this;
	while(aux = aux._parent)
		r.unshift(aux);	
	return r;
}

/**
* Returns a quaternion with all parents rotations
* @method getGlobalRotation
* @return {quat} Quaternion
*/
/*
Transform.prototype.getGlobalRotation = function (q)
{
	q = q || quat.create();
	q.set(this._rotation);

	//concatenate all parents rotations
	var aux = this._parent;
	while(aux)
	{
		quat.multiply(q,q,aux._rotation);
		aux = aux._parent;
	}
	return q;
}
*/
/**
* Returns a Matrix with all parents rotations
* @method getGlobalRotationMatrix
* @return {mat4} Matrix rotation
*/
/*
Transform.prototype.getGlobalRotationMatrix = function (m)
{
	var q = quat.clone(this._rotation);

	var aux = this._parent;
	while(aux)
	{
		quat.multiply(q, q, aux._rotation);
		aux = aux._parent;
	}

	m = m || mat4.create();
	return mat4.fromQuat(m,q);
}
*/


/**
* Returns the local matrix of this transform without the rotation or scale
* @method getGlobalTranslationMatrix
* @return {mat4} the matrix in array format
*/
Transform.prototype.getGlobalTranslationMatrix = function ()
{
	var pos = this.getGlobalPosition();
	return mat4.fromValues(1,0,0,0, 0,1,0,0, 0,0,1,0, pos[0], pos[1], pos[2], 1);
}

/**
* Returns the global rotation in quaternion array (a copy)
* @method getGlobalRotationMatrix
* @return {mat4} the rotation
*/
Transform.prototype.getGlobalRotationMatrix = function(out)
{
	var out = out || mat4.create();
	if( !this._parent )
		return mat4.fromQuat( out, this._rotation );
		
	var r = mat4.create();
	var aux = this;
	while( aux )
	{
		mat4.fromQuat(r, aux._rotation);
		mat4.multiply(out,out,r);
		aux = aux._parent;
	}
	return out;
}


/**
* Returns the local matrix of this transform without the scale
* @method getGlobalTranslationRotationMatrix
* @return {mat4} the matrix in array format
*/
Transform.prototype.getGlobalTranslationRotationMatrix = function ()
{
	var pos = this.getGlobalPosition();
	return mat4.fromRotationTranslation(mat4.create(), this.getGlobalRotation(), pos);
}
Transform.prototype.getGlobalMatrixWithoutScale = Transform.prototype.getGlobalTranslationRotationMatrix;



/**
* Returns the matrix for the normals in the shader
* @method getNormalMatrix
* @return {mat4} the matrix in array format
*/
Transform.prototype.getNormalMatrix = function (m)
{
	if(this._must_update_matrix)
		this.updateMatrix();

	m = m || mat4.create();
	if (this._parent)
		mat4.multiply( this._global_matrix, this._parent.getGlobalMatrix(), this._local_matrix );
	else
		m.set(this._local_matrix); //return local because it has no parent
	return mat4.transpose(m, mat4.invert(m,m));
}

/**
* Configure the transform from a local Matrix (do not tested carefully)
* @method fromMatrix
* @param {mat4} matrix the matrix in array format
* @param {bool} is_global tells if the matrix is in global space [optional]
*/
Transform.prototype.fromMatrix = (function() { 

	var global_temp = mat4.create();
	var temp_mat4 = mat4.create();
	var temp_mat3 = mat3.create();
	var temp_vec3 = vec3.create();
	//var scale_temp = mat4.create();
	
	return function fromMatrix( m, is_global )
	{
		if(is_global && this._parent)
		{
			mat4.copy(this._global_matrix, m); //assign to global
			var M_parent = this._parent.getGlobalMatrix( global_temp ); //get parent transform
			mat4.invert(M_parent,M_parent); //invert
			m = mat4.multiply( this._local_matrix, M_parent, m ); //transform from global to local
		}

		//pos
		var M = temp_mat4;
		M.set(m);
		mat4.multiplyVec3( this._position, M, LS.ZERO );

		//compute scale
		this._scaling[0] = vec3.length( mat4.rotateVec3( temp_vec3, M, LS.RIGHT) );
		this._scaling[1] = vec3.length( mat4.rotateVec3( temp_vec3, M, LS.TOP) );
		this._scaling[2] = vec3.length( mat4.rotateVec3( temp_vec3, M, LS.BACK) );

		//apply scale, why the inverse? ??
		//mat4.scale( scale_temp, M, [1/this._scaling[0], 1/this._scaling[1], 1/this._scaling[2]] );

		//quat.fromMat4(this._rotation, M);
		//*
		//normalize system vectors
		vec3.normalize( M.subarray(0,3), M.subarray(0,3) );
		vec3.normalize( M.subarray(4,7), M.subarray(4,7) );
		vec3.normalize( M.subarray(8,11), M.subarray(8,11) );

		var M3 = mat3.fromMat4( temp_mat3, M );
		mat3.transpose( M3, M3 );
		quat.fromMat3( this._rotation, M3 );
		quat.normalize( this._rotation, this._rotation );
		//*/

		if(m != this._local_matrix)
			mat4.copy(this._local_matrix, m);
		this._must_update_matrix = false;
		this._on_change(true);
	}
})();

Transform.fromMatrix4ToTransformData = (function() { 

	var global_temp = mat4.create();
	var temp_mat4 = mat4.create();
	var temp_mat3 = mat3.create();
	var temp_vec3 = vec3.create();
	
	return function fromMatrix4ToTransformData( m, out )
	{
		var data = out || new Float32Array( 3 + 4 + 3 ); //pos, rot, scale
		var position = data.subarray(0,3);
		var rotation = data.subarray(3,7);
		quat.identity(rotation);
		var scaling = data.subarray(7,10);

		//pos
		var M = temp_mat4;
		M.set(m);
		mat4.multiplyVec3( position, M, LS.ZERO );

		//extract scaling by 
		scaling[0] = vec3.length( mat4.rotateVec3( temp_vec3, M, LS.RIGHT) );
		scaling[1] = vec3.length( mat4.rotateVec3( temp_vec3, M, LS.TOP) );
		scaling[2] = vec3.length( mat4.rotateVec3( temp_vec3, M, LS.BACK) );

		//quat.fromMat4( rotation, M ); //doesnt work

		//normalize axis vectors
		vec3.normalize( M.subarray(0,3), M.subarray(0,3) );
		vec3.normalize( M.subarray(4,7), M.subarray(4,7) );
		vec3.normalize( M.subarray(8,11), M.subarray(8,11) );

		var M3 = mat3.fromMat4( temp_mat3, M );
		mat3.transpose( M3, M3 );
		quat.fromMat3( rotation, M3 );
		quat.normalize( rotation, rotation );

		return data;
	}
})();


/**
* Configure the transform rotation from a vec3 Euler angles (heading,attitude,bank)
* @method setRotationFromEuler
* @param {mat4} src, the matrix in array format
*/
Transform.prototype.setRotationFromEuler = function(v)
{
	quat.fromEuler( this._rotation, v );
	this._must_update_matrix = true;
	this._on_change();
}

/**
* sets the position
* @method setPosition
* @param {number} x 
* @param {number} y
* @param {number} z 
*/
Transform.prototype.setPosition = function(x,y,z)
{
	if(arguments.length == 3)
		vec3.set(this._position, x,y,z);
	else
		vec3.copy(this._position, x);
	this._must_update_matrix = true;
	this._on_change();
}

/**
* sets the rotation from a quaternion or from an angle(rad) and axis
* @method setRotation
* @param {quat} rotation in quaterion format or angle
*/
Transform.prototype.setRotation = function(q_angle,axis)
{
	if(axis)
		quat.setAxisAngle( this._rotation, axis, q_angle );
	else
		quat.copy(this._rotation, q);
	this._must_update_matrix = true;
	this._on_change();
}

/**
* sets the scale
* @method setScale
* @param {number} x 
* @param {number} y
* @param {number} z 
*/
Transform.prototype.setScale = function(x,y,z)
{
	if(arguments.length == 3)
		vec3.set(this._scaling, x,y,z);
	else
		vec3.set(this._scaling, x,x,x);
	this._must_update_matrix = true;
	this._on_change();
}

/**
* translates object in local coordinates (adds to the position)
* @method translate
* @param {number} x 
* @param {number} y
* @param {number} z 
*/
Transform.prototype.translate = function(x,y,z)
{
	if(arguments.length == 3)
		vec3.add( this._position, this._position, [x,y,z] );
	else
		vec3.add( this._position, this._position, x );
	this._must_update_matrix = true;
	this._on_change();
}

/**
* NOT TESTED
* translates object in object coordinates (using the rotation and the scale)
* @method translateLocal
* @param {number} x 
* @param {number} y
* @param {number} z 
*/
Transform.prototype.translateLocal = function(x,y,z)
{
	if(arguments.length == 3)
		vec3.add( this._position, this._position, this.transformVector([x,y,z]) );
	else
		vec3.add( this._position, this._position, this.transformVector(x) );
	this._must_update_matrix = true;
	this._on_change();
}

/**
* rotate object in local space (axis is in local space)
* @method rotate
* @param {number} angle_in_deg 
* @param {vec3} axis
*/
Transform.prototype.rotate = (function(){

	var temp = quat.create();

	return function(angle_in_deg, axis)
	{
		quat.setAxisAngle( temp, axis, angle_in_deg * 0.0174532925 );
		quat.multiply( this._rotation, this._rotation, temp );
		this._must_update_matrix = true;
		this._on_change();
	}
})();

/**
* rotate object in local space in local X axis
* @method rotateX
* @param {number} angle_in_deg 
*/
Transform.prototype.rotateX = function(angle_in_deg)
{
	quat.rotateX( this._rotation, this._rotation, angle_in_deg * 0.0174532925 );
	this._must_update_matrix = true;
	this._on_change();
}

/**
* rotate object in local space in local Y axis
* @method rotateY
* @param {number} angle_in_deg 
*/
Transform.prototype.rotateY = function(angle_in_deg)
{
	quat.rotateY( this._rotation, this._rotation, angle_in_deg * 0.0174532925 );
	this._must_update_matrix = true;
	this._on_change();
}

/**
* rotate object in local space in local Z axis
* @method rotateZ
* @param {number} angle_in_deg 
*/
Transform.prototype.rotateZ = function(angle_in_deg)
{
	quat.rotateZ( this._rotation, this._rotation, angle_in_deg * 0.0174532925 );
	this._must_update_matrix = true;
	this._on_change();
}


/**
* rotate object in global space (axis is in global space)
* @method rotateGlobal
* @param {number} angle_in_deg 
* @param {vec3} axis
*/
Transform.prototype.rotateGlobal = function(angle_in_deg, axis)
{
	var R = quat.setAxisAngle(quat.create(), axis, angle_in_deg * 0.0174532925);
	quat.multiply(this._rotation, R, this._rotation);
	this._must_update_matrix = true;
	this._on_change();
}

/**
* rotate object in local space using a quat
* @method rotateQuat
* @param {quat} quaternion
*/
Transform.prototype.rotateQuat = function(quaternion)
{
	quat.multiply(this._rotation, this._rotation, quaternion);
	this._must_update_matrix = true;
	this._on_change();
}

/**
* rotate object in global space using a quat
* @method rotateQuatGlobal
* @param {quat} quaternion
*/
Transform.prototype.rotateQuatGlobal = function(quaternion)
{
	quat.multiply(this._rotation, quaternion, this._rotation);
	this._must_update_matrix = true;
	this._on_change();
}

/**
* scale the object
* @method scale
* @param {number} x 
* @param {number} y
* @param {number} z 
*/
Transform.prototype.scale = function(x,y,z)
{
	if(arguments.length == 3)
		vec3.multiply(this._scaling, this._scaling, [x,y,z]);
	else
		vec3.multiply(this._scaling, this._scaling,x);
	this._must_update_matrix = true;
	this._on_change();
}

/**
* This method is static (call it from Transform.interpolate)
* interpolate the transform between two transforms and stores the result in another Transform
* @method interpolate
* @param {Transform} a 
* @param {Transform} b
* @param {number} factor from 0 to 1 
* @param {Transform} the destination
*/
Transform.interpolate = function(a,b,factor, result)
{
	vec3.lerp(result._scaling, a._scaling, b._scaling, factor); //scale
	vec3.lerp(result._position, a._position, b._position, factor); //position
	quat.slerp(result._rotation, a._rotation, b._rotation, factor); //rotation
	this._must_update_matrix = true;
	this._on_change();
}

/**
* Orients the transform to look from one position to another
* @method lookAt
* @param {vec3} position
* @param {vec3} target
* @param {vec3} up
* @param {boolean} in_world tells if the values are in world coordinates (otherwise asume its in local coordinates)
*/
Transform.prototype.lookAt = (function() { 

	//avoid garbage
	var GM = mat4.create();
	var temp = mat4.create();
	var temp_pos = vec3.create();
	var temp_target = vec3.create();
	var temp_up = vec3.create();
	
	return function(pos, target, up, in_world)
	{

	//convert to local space
	if(in_world && this._parent)
	{
		this._parent.getGlobalMatrix( GM );
		var inv = mat4.invert(GM,GM);
		mat4.multiplyVec3(temp_pos, inv, pos);
		mat4.multiplyVec3(temp_target, inv, target);
		mat4.rotateVec3(temp_up, inv, up );
	}
	else
	{
		temp_pos.set( pos );
		temp_target.set( target );
		temp_up.set( up );
	}

	mat4.lookAt(temp, temp_pos, temp_target, temp_up);
	//mat4.invert(temp, temp);

	quat.fromMat4( this._rotation, temp );
	this._position.set( temp_pos );	
	this._must_update_matrix = true;

	/*
	mat4.lookAt(temp, pos, target, up);
	mat4.invert(temp, temp);
	this.fromMatrix(temp);
	this.updateGlobalMatrix();
	*/
	}
})();

//Events
Transform.prototype._on_change = function(only_events)
{
	if(!only_events)
		this._must_update_matrix = true;
	LEvent.trigger(this, "changed", this);
	if(this._root)
		LEvent.trigger(this._root, "transformChanged", this);
}

//Transform
/**
* returns the [0,0,-1] vector in global space
* @method getFront
* @return {vec3}
*/
Transform.prototype.getFront = function(out) {
	return vec3.transformQuat(out || vec3.create(), Transform.FRONT, this.getGlobalRotation() );
}

/**
* returns the [0,1,0] vector in global space
* @method getTop
* @return {vec3}
*/
Transform.prototype.getTop = function(out) {
	return vec3.transformQuat(out || vec3.create(), Transform.UP, this.getGlobalRotation() );
}

/**
* returns the [1,0,0] vector in global space
* @method getRight
* @return {vec3}
*/
Transform.prototype.getRight = function(out) {
	return vec3.transformQuat(out || vec3.create(), Transform.RIGHT, this.getGlobalRotation() );
}

/**
* Multiplies a point by the local matrix (not global)
* If no destination is specified a new vector is created
* @method transformPoint
* @param {vec3} point
* @param {vec3} destination (optional)
*/
Transform.prototype.transformPoint = function(vec, dest) {
	dest = dest || vec3.create();
	if(this._must_update_matrix) this.updateMatrix();
	return mat4.multiplyVec3( dest, this._local_matrix, vec );
}


/**
* convert from local coordinates to global coordinates
* If no destination is specified a new vector is created
* @method transformPointGlobal
* @param {vec3} point
* @param {vec3} destination (optional)
*/
Transform.prototype.transformPointGlobal = function(vec, dest) {
	dest = dest || vec3.create();
	if(this._must_update_matrix) this.updateMatrix();
	return mat4.multiplyVec3( dest, this.getGlobalMatrixRef(), vec );
}

/**
* convert from local coordinates to global coordinates (it is the same as transformPointGlobal)
* If no destination is specified a new vector is created
* @method localToGlobal
* @param {vec3} point
* @param {vec3} destination (optional)
*/
Transform.prototype.localToGlobal = Transform.prototype.transformPointGlobal;

/**
* convert from global coordinates to local coordinates
* If no destination is specified a new vector is created
* @method globalToLocal
* @param {vec3} point
* @param {vec3} destination (optional)
*/
Transform.prototype.globalToLocal = function(vec, dest) {
	dest = dest || vec3.create();
	if(this._must_update_matrix) this.updateMatrix();
	var inv = mat4.invert( mat4.create(), this.getGlobalMatrixRef() );
	return mat4.multiplyVec3( dest, inv, vec );
}


/**
* Applies the transformation to a vector (rotate but not translate)
* If no destination is specified the transform is applied to vec
* @method transformVector
* @param {vec3} vector
* @param {vec3} destination (optional)
*/
Transform.prototype.transformVector = function(vec, dest) {
	return vec3.transformQuat(dest || vec3.create(), vec, this._rotation );
}

/**
* Applies the transformation to a vector (rotate but not translate)
* If no destination is specified the transform is applied to vec
* @method transformVectorGlobal
* @param {vec3} vector
* @param {vec3} destination (optional)
*/
Transform.prototype.transformVectorGlobal = function(vec, dest) {
	return vec3.transformQuat(dest || vec3.create(), vec, this.getGlobalRotation() );
}

Transform.prototype.localVectorToGlobal = Transform.prototype.transformVectorGlobal;

Transform.prototype.globalVectorToLocal = function(vec, dest) {
	var Q = this.getGlobalRotation();
	quat.invert(Q,Q);
	return vec3.transformQuat(dest || vec3.create(), vec, Q );
}

/**
* Apply a transform to this transform
* @method applyTransform
*/
Transform.prototype.applyTransform = function( transform, center, is_global )
{
	//is local

	//apply translation
	vec3.add( this._position, this._position, transform._position );

	//apply rotation
	quat.multiply( this._rotation, this._rotation, transform._rotation );

	//apply scale
	vec3.multiply( this._scaling, this._scaling, transform._scaling );

	this._must_update_matrix = true; //matrix must be redone?
}



/**
* Applies the transformation using a matrix
* @method applyTransformMatrix
* @param {mat4} matrix with the transform
* @param {vec3} center different pivot [optional] if omited 0,0,0 will be used
* @param {bool} is_global (optional) tells if the transformation should be applied in global space or local space
*/
Transform.prototype.applyTransformMatrix = (function(){ 
	var T = mat4.create();
	var inv_center = vec3.create();
	var iT = mat4.create();
	var M = mat4.create();
	var temp = mat4.create();
	
	return function(matrix, center, is_global)
	{
		var M = matrix;

		if(center)
		{
			mat4.setTranslation( T, center);
			vec3.scale( inv_center, center, -1 );
			mat4.setTranslation( iT, inv_center);

			mat4.multiply( M, T, matrix );
			mat4.multiply( M, M, iT );
		}


		if(!this._parent)
		{
			if(is_global)
			{
				this.applyLocalTransformMatrix( M );
				return;
			}

			//is local
			this.applyLocalTransformMatrix( M );
			return;
		}

		/*
		//convert transform to local coordinates
		var GM = this.getGlobalMatrix();
		var temp_mat = mat4.multiply( mat4.create(), M, GM );

		var PGM = this._parent._global_matrix;
		var inv_pgm = mat4.invert( mat4.create(), PGM );

		mat4.multiply(temp_mat, inv_pgm, temp_mat );
		this.applyLocalTransformMatrix( temp_mat );
		//*/

		//*
		var GM = this.getGlobalMatrix();
		var PGM = this._parent._global_matrix;
		mat4.multiply( this._global_matrix, M, GM );

		mat4.invert(temp,PGM);
		mat4.multiply( this._local_matrix, temp, this._global_matrix );
		this.fromMatrix( this._local_matrix );
		//*/
	};
})();

//applies matrix to position, rotation and scale individually, doesnt take into account parents
Transform.prototype.applyLocalTransformMatrix = function( M )
{
	var temp = vec3.create();

	//apply translation
	vec3.transformMat4( this._position, this._position, M );

	//apply scale
	mat4.rotateVec3( temp, M, [1,0,0] );
	this._scaling[0] *= vec3.length( temp );
	mat4.rotateVec3( temp, M, [0,1,0] );
	this._scaling[1] *= vec3.length( temp );
	mat4.rotateVec3( temp, M, [0,0,1] );
	this._scaling[2] *= vec3.length( temp );

	//apply rotation
	var m = mat4.invert(mat4.create(), M);
	mat4.transpose(m, m);
	var m3 = mat3.fromMat4( mat3.create(), m);
	var q = quat.fromMat3(quat.create(), m3);
	quat.normalize(q, q);
	quat.multiply( this._rotation, q, this._rotation );

	this._must_update_matrix = true; //matrix must be redone?
	return;
}


/*
Transform.prototype.applyTransformMatrix = function(matrix, center, is_global)
{
	var M = matrix;

	if(center)
	{
		var T = mat4.setTranslation( mat4.create(), center);
		var inv_center = vec3.scale( vec3.create(), center, -1 );
		var iT = mat4.setTranslation( mat4.create(), inv_center);

		M = mat4.create();
		mat4.multiply( M, T, matrix );
		mat4.multiply( M, M, iT );
	}

	if(!this._parent)
	{
		if(is_global)
			mat4.multiply(this._local_matrix, M, this._local_matrix);
		else
			mat4.multiply(this._local_matrix, this._local_matrix, M);
		this.fromMatrix(this._local_matrix);
		mat4.copy(this._global_matrix, this._local_matrix); //no parent? then is the global too
		return;
	}

	var GM = this.getGlobalMatrix();
	var PGM = this._parent._global_matrix;
	var temp = mat4.create();
	mat4.multiply( this._global_matrix, M, GM );

	mat4.invert(temp,PGM);
	mat4.multiply(this._local_matrix, temp, this._global_matrix );
	this.fromMatrix(this._local_matrix);
}
*/



LS.registerComponent( Transform );
LS.Transform = Transform;

// ******* CAMERA **************************

/**
* Camera that contains the info about a camera
* @class Camera
* @namespace LS.Components
* @constructor
* @param {String} object to configure from
*/

function Camera(o)
{
	this.enabled = true;
	this.layers = 3;

	this.clear_color = true;
	this.clear_depth = true;

	this._type = Camera.PERSPECTIVE;

	//contain the eye, center, up if local space
	this._eye = vec3.fromValues(0,100, 100); //TODO: change to position
	this._center = vec3.fromValues(0,0,0);	//TODO: change to target
	this._up = vec3.fromValues(0,1,0);

	//in global coordinates
	this._global_eye = vec3.fromValues(0,100,100);
	this._global_center = vec3.fromValues(0,0,0);
	this._global_up = vec3.fromValues(0,1,0);
	this._global_front = vec3.fromValues(0,0,-1);

	//clipping planes
	this._near = 1;
	this._far = 1000;

	//orthographics planes (near and far took from ._near and ._far)
	this._ortho = new Float32Array([-1,1,-1,1]);

	this._aspect = 1.0; //must be one, otherwise it gets deformed, the final one used is in final_aspect
	this._fov = 45; //persp
	this._frustum_size = 50; //ortho
	this._final_aspect = 1.0; //the one used when computing the projection matrix

	//viewport in normalized coordinates: left, bottom, width, height
	this._viewport = new Float32Array([0,0,1,1]);
	this._viewport_in_pixels = vec4.create(); //viewport in screen coordinates

	this._view_matrix = mat4.create();
	this._projection_matrix = mat4.create();
	this._viewprojection_matrix = mat4.create();
	this._model_matrix = mat4.create(); //inverse of viewmatrix (used for local vectors)

	//this._previous_viewprojection_matrix = mat4.create(); //used for motion blur


	//lazy upload
	this._must_update_view_matrix = true;
	this._must_update_projection_matrix = true;

	this._rendering_index = -1; //tells the number of this camera in the rendering process

	//render to texture
	this.render_to_texture = false;
	this.texture_name = ""; //name
	this.texture_size = vec2.fromValues(0,0); //0 means same as screen
	this.texture_high = false;
	this.texture_clone = false; //this registers a clone of the texture used for rendering, to avoid rendering and reading of the same texture, but doubles the memory

	if(o) 
		this.configure(o);
	//this.updateMatrices(); //done by configure

	this._uniforms = {
		u_view: this._view_matrix,
		u_viewprojection: this._viewprojection_matrix,
		u_camera_eye: this._global_eye,
		u_camera_front: this._global_front,
		u_camera_planes: vec2.fromValues( this.near, this.far ),
		u_camera_perspective: vec3.create()
	};

	this.updateMatrices();
	this._frustum_planes = geo.extractPlanes( this._viewprojection_matrix );

	//LEvent.bind(this,"cameraEnabled", this.onCameraEnabled.bind(this));
}

Camera.icon = "mini-icon-camera.png";

Camera.PERSPECTIVE = 1;
Camera.ORTHOGRAPHIC = 2; //orthographic adapted to aspect ratio of viewport
Camera.ORTHO2D = 3; //orthographic with manually defined left,right,top,bottom

Camera["@type"] = { type: "enum", values: { "perspective": Camera.PERSPECTIVE, "orthographic": Camera.ORTHOGRAPHIC, "ortho2D": Camera.ORTHO2D } };
Camera["@eye"] = { type: "vec3", widget: "position" };
Camera["@center"] = { type: "vec3", widget: "position" };
Camera["@texture_name"] = { type: "texture" };
Camera["@layers"] = { type: "layers" };

// used when rendering a cubemap to set the camera view direction (crossx and crossy are for when generating a CROSS cubemap image)

//OLD VERSION
Camera.cubemap_camera_parameters = [
	{ name: "posx", dir: vec3.fromValues(1,0,0), up: vec3.fromValues(0,-1,0), crossx:2, crossy:1 },
	{ name: "negx", dir: vec3.fromValues(-1,0,0), up: vec3.fromValues(0,-1,0), crossx:0, crossy:1 },
	{ name: "posy", dir: vec3.fromValues(0,1,0), up: vec3.fromValues(0,0,1), crossx:1, crossy:0 },
	{ name: "negy", dir: vec3.fromValues(0,-1,0), up: vec3.fromValues(0,0,-1), crossx:1, crossy:2 },
	{ name: "posz", dir: vec3.fromValues(0,0,1), up: vec3.fromValues(0,-1,0), crossx:1, crossy:1 },
	{ name: "negz", dir: vec3.fromValues(0,0,-1), up: vec3.fromValues(0,-1,0), crossx:3, crossy:1 }
];
//*/
/*
Camera.cubemap_camera_parameters = [
	{ name: "posx", dir: vec3.fromValues(-1,0,0), up: vec3.fromValues(0,1,0), right: vec3.fromValues(0,0,-1), crossx:0, crossy:1 },
	{ name: "negx", dir: vec3.fromValues(1,0,0), up: vec3.fromValues(0,1,0), right: vec3.fromValues(0,0,1), crossx:2, crossy:1 },
	{ name: "posy", dir: vec3.fromValues(0,-1,0), up: vec3.fromValues(0,0,-1), right: vec3.fromValues(1,0,0), crossx:1, crossy:2 },
	{ name: "negy", dir: vec3.fromValues(0,1,0), up: vec3.fromValues(0,0,1), right: vec3.fromValues(-1,0,0), crossx:1, crossy:0 },
	{ name: "posz", dir: vec3.fromValues(0,0,-1), up: vec3.fromValues(0,1,0), right: vec3.fromValues(1,0,0), crossx:1, crossy:1 },
	{ name: "negz", dir: vec3.fromValues(0,0,1), up: vec3.fromValues(0,1,0), right: vec3.fromValues(-1,0,0), crossx:3, crossy:1 }
];

//*/

/*
Texture.cubemap_camera_parameters = [
	{ type:"posX", dir: vec3.fromValues(-1,0,0), 	up: vec3.fromValues(0,1,0),	right: vec3.fromValues(0,0,-1) },
	{ type:"negX", dir: vec3.fromValues(1,0,0),		up: vec3.fromValues(0,1,0),	right: vec3.fromValues(0,0,1) },
	{ type:"posY", dir: vec3.fromValues(0,-1,0), 	up: vec3.fromValues(0,0,-1), right: vec3.fromValues(1,0,0) },
	{ type:"negY", dir: vec3.fromValues(0,1,0),		up: vec3.fromValues(0,0,1),	right: vec3.fromValues(-1,0,0) },
	{ type:"posZ", dir: vec3.fromValues(0,0,-1), 	up: vec3.fromValues(0,1,0),	right: vec3.fromValues(1,0,0) },
	{ type:"negZ", dir: vec3.fromValues(0,0,1),		up: vec3.fromValues(0,1,0),	right: vec3.fromValues(-1,0,0) }
];
*/


Camera.prototype.getResources = function (res)
{
	//nothing to do, cameras dont use assets, althoug they could generate them
	return res;
}


/*
Camera.prototype.onCameraEnabled = function(e,options)
{
	if(this.flip_x)
		options.reverse_backfacing = !options.reverse_backfacing;
}
*/

/**
* Camera type, could be Camera.PERSPECTIVE or Camera.ORTHOGRAPHIC
* @property type {vec3}
* @default Camera.PERSPECTIVE;
*/
Object.defineProperty( Camera.prototype, "type", {
	get: function() {
		return this._type;
	},
	set: function(v) {
		if(	this._type != v)
		{
			this._must_update_view_matrix = true;
			this._must_update_projection_matrix = true;
		}
		this._type = v;
	},
	enumerable: true
});

/**
* The position of the camera (in local space, node space)
* @property eye {vec3}
* @default [0,100,100]
*/
Object.defineProperty( Camera.prototype, "eye", {
	get: function() {
		return this._eye;
	},
	set: function(v) {
		this._eye.set(v);
		this._must_update_view_matrix = true;
	},
	enumerable: true
});

/**
* The center where the camera points (in local space, node space)
* @property center {vec3}
* @default [0,0,0]
*/
Object.defineProperty( Camera.prototype, "center", {
	get: function() {
		return this._center;
	},
	set: function(v) {
		this._center.set(v);
		this._must_update_view_matrix = true;
	},
	enumerable: true
});

/**
* The up vector of the camera (in local space, node space)
* @property up {vec3}
* @default [0,1,0]
*/
Object.defineProperty( Camera.prototype, "up", {
	get: function() {
		return this._up;
	},
	set: function(v) {
		this._up.set(v);
		this._must_update_view_matrix = true;
	},
	enumerable: true
});

/**
* The near plane
* @property near {number}
* @default 1
*/
Object.defineProperty( Camera.prototype, "near", {
	get: function() {
		return this._near;
	},
	set: function(v) {
		if(	this._near != v)
			this._must_update_projection_matrix = true;
		this._near = v;
	},
	enumerable: true
});

/**
* The far plane
* @property far {number}
* @default 1000
*/
Object.defineProperty( Camera.prototype, "far", {
	get: function() {
		return this._far;
	},
	set: function(v) {
		if(	this._far != v)
			this._must_update_projection_matrix = true;
		this._far = v;
	},
	enumerable: true
});

/**
* The camera aspect ratio
* @property aspect {number}
* @default 1
*/
Object.defineProperty( Camera.prototype, "aspect", {
	get: function() {
		return this._aspect;
	},
	set: function(v) {
		if(	this._aspect != v)
			this._must_update_projection_matrix = true;
		this._aspect = v;
	},
	enumerable: true
});
/**
* The field of view in degrees
* @property fov {number}
* @default 45
*/
Object.defineProperty( Camera.prototype, "fov", {
	get: function() {
		return this._fov;
	},
	set: function(v) {
		if(	this._fov != v)
			this._must_update_projection_matrix = true;
		this._fov  = v;
	},
	enumerable: true
});

/**
* The frustum size when working in ORTHOGRAPHIC
* @property frustum_size {number}
* @default 50
*/

Object.defineProperty( Camera.prototype, "frustum_size", {
	get: function() {
		return this._frustum_size;
	},
	set: function(v) {
		if(	this._frustum_size != v)
		{
			this._must_update_view_matrix = true;
			this._must_update_projection_matrix = true;
		}
		this._frustum_size  = v;
	},
	enumerable: true
});

/**
* The viewport in normalized coordinates (left,bottom, width, height)
* @property viewport {vec4}
*/
Object.defineProperty( Camera.prototype, "viewport", {
	get: function() {
		return this._viewport;
	},
	set: function(v) {
		this._viewport.set(v);
	},
	enumerable: true
});

/**
* @property viewport_offset {vec2}
*/
Object.defineProperty( Camera.prototype, "viewport_offset", {
	get: function() {
		return this._viewport.subarray(0,2);
	},
	set: function(v) {
		this._viewport.set(v);
	},
	enumerable: true
});

/**
* @property viewport_size {vec2}
*/
Object.defineProperty( Camera.prototype, "viewport_size", {
	get: function() {
		return this._viewport.subarray(2,4);
	},
	set: function(v) {
		this._viewport.set(v,2);
	},
	enumerable: true
});

Camera.prototype.onAddedToNode = function(node)
{
	if(!node.camera)
		node.camera = this;
	LEvent.bind( node, "collectCameras", this.onCollectCameras, this );
}

Camera.prototype.onRemovedFromNode = function(node)
{
	if(node.camera == this)
		delete node.camera;

	if(this._texture) //free memory
	{
		this._texture = null;
		this._fbo = null;
		this._renderbuffer = null;

	}
}

Camera.prototype.isRenderedToTexture = function()
{
	return this.enabled && this.render_to_texture && this.texture_name;
}

Camera.prototype.onCollectCameras = function(e, cameras)
{
	if(!this.enabled)
		return;

	if(!this.isRenderedToTexture())
		cameras.push(this);
	else
		cameras.unshift(this); //put at the begining

	//in case we need to render to a texture this camera
	//not very fond of this part, but its more optimal
	if(this.render_to_texture && this.texture_name)
	{
		if(!this._binded_render_frame)
		{
			LEvent.bind(this, "beforeRenderFrame", this.startFBO, this );
			LEvent.bind(this, "afterRenderFrame", this.endFBO, this );
			this._binded_render_frame = true;
		}
	}
	else if( this._binded_render_frame )
	{
		LEvent.unbind(this, "beforeRenderFrame", this.startFBO, this );
		LEvent.unbind(this, "afterRenderFrame", this.endFBO, this );
	}
}

/**
* 
* @method lookAt
* @param {vec3} eye
* @param {vec3} center
* @param {vec3} up
*/
Camera.prototype.lookAt = function(eye,center,up)
{
	vec3.copy(this._eye, eye);
	vec3.copy(this._center, center);
	vec3.copy(this._up,up);
	this._must_update_view_matrix = true;
}

/**
* Update matrices according to the eye,center,up,fov,aspect,...
* @method updateMatrices
*/
Camera.prototype.updateMatrices = function()
{
	if(this.type == Camera.ORTHOGRAPHIC)
		mat4.ortho(this._projection_matrix, -this._frustum_size*this._final_aspect*0.5, this._frustum_size*this._final_aspect*0.5, -this._frustum_size*0.5, this._frustum_size*0.5, this._near, this._far);
	else if (this.type == Camera.ORTHO2D)
		mat4.ortho(this._projection_matrix, this._ortho[0], this._ortho[1], this._ortho[2], this._ortho[3], this._near, this._far);
	else
		mat4.perspective(this._projection_matrix, this._fov * DEG2RAD, this._final_aspect, this._near, this._far);

	//if (this.type != Camera.ORTHO2D)
	if(this._root && this._root._is_root) //in root node
		mat4.lookAt( this._view_matrix, this._eye, this._center, this._up );
	else
		mat4.lookAt( this._view_matrix, this.getEye(this._global_eye), this.getCenter(this._global_center), this.getUp(this._global_up) );

	/*
	if(this.flip_x) //used in reflections
	{
		//mat4.scale(this._projection_matrix,this._projection_matrix, [-1,1,1]);
	};
	*/
	//if(this._root && this._root.transform)

	mat4.multiply(this._viewprojection_matrix, this._projection_matrix, this._view_matrix );
	mat4.invert(this._model_matrix, this._view_matrix );

	this._must_update_view_matrix = false;
	this._must_update_projection_matrix = false;
}

/**
* Update the frustum planes according to viewprojection_matrix, used for visibility testing
* @method updateFrustumPlanes
* @return {Float32Array} planes
*/
Camera.prototype.updateFrustumPlanes = function()
{
	geo.extractPlanes( this._viewprojection_matrix, this._frustum_planes );
	return this._frustum_planes;
}

/**
* returns the inverse of the viewmatrix
* @method getModelMatrix
* @param {mat4} m optional output container
* @return {mat4} matrix
*/
Camera.prototype.getModelMatrix = function(m)
{
	m = m || mat4.create();
	if(this._must_update_view_matrix)
		this.updateMatrices();
	return mat4.copy( m, this._model_matrix );
}

/**
* returns the viewmatrix
* @method getViewMatrix
* @param {mat4} m optional output container
* @return {mat4} matrix
*/
Camera.prototype.getViewMatrix = function(m)
{
	m = m || mat4.create();
	if(this._must_update_view_matrix)
		this.updateMatrices();
	return mat4.copy( m, this._view_matrix );
}

/**
* returns the projection matrix
* @method getProjectionMatrix
* @param {mat4} m optional output container
* @return {mat4} matrix
*/
Camera.prototype.getProjectionMatrix = function(m)
{
	m = m || mat4.create();
	if(this._must_update_projection_matrix)
		this.updateMatrices();
	return mat4.copy( m, this._projection_matrix );
}

/**
* returns the view projection matrix
* @method getViewProjectionMatrix
* @param {mat4} m optional output container
* @return {mat4} matrix
*/
Camera.prototype.getViewProjectionMatrix = function(m)
{
	m = m || mat4.create();
	if(this._must_update_view_matrix || this._must_update_projection_matrix)
		this.updateMatrices();
	return mat4.copy( m, this._viewprojection_matrix );
}

/**
* returns the model view projection matrix computed from a passed model
* @method getModelViewProjectionMatrix
* @param {mat4} model model matrix
* @param {mat4} out optional output container
* @return {mat4} matrix
*/
Camera.prototype.getModelViewProjectionMatrix = function(model, out)
{
	out = out || mat4.create();
	if(this._must_update_view_matrix || this._must_update_projection_matrix)
		this.updateMatrices();
	return mat4.multiply( out, this._viewprojection_matrix, model );
}

/**
* apply a transform to all the vectors (eye,center,up) using a matrix
* @method updateVectors
* @param {mat4} model matrix
*/
Camera.prototype.updateVectors = function(model)
{
	var front = vec3.subtract(vec3.create(), this._center, this._eye);
	var dist = vec3.length(front);
	this._eye = mat4.multiplyVec3(vec3.create(), model, vec3.create() );
	this._center = mat4.multiplyVec3(vec3.create(), model, vec3.fromValues(0,0,-dist));
	this._up = mat4.rotateVec3(vec3.create(), model, vec3.fromValues(0,1,0));
	this.updateMatrices();
}

/**
* transform a local coordinate to global coordinates
* @method getLocalPoint
* @param {vec3} v vector
* @param {vec3} dest
* @return {vec3} v in global coordinates
*/
Camera.prototype.getLocalPoint = function(v, dest)
{
	dest = dest || vec3.create();
	if(this._must_update_view_matrix)
		this.updateMatrices();
	var temp = this._model_matrix; //mat4.create();
	//mat4.invert( temp, this._view_matrix );
	if(this._root && this._root.transform)
		mat4.multiply( temp, temp, this._root.transform.getGlobalMatrixRef() );
	return mat4.multiplyVec3(dest, temp, v );
}

/**
* rotate a local coordinate to global coordinates (skipping translation)
* @method getLocalVector
* @param {vec3} v vector
* @param {vec3} dest
* @return {vec3} v in global coordinates
*/

Camera.prototype.getLocalVector = function(v, dest)
{
	dest = dest || vec3.create();
	if(this._must_update_view_matrix)
		this.updateMatrices();
	var temp = this._model_matrix; //mat4.create();
	//mat4.invert( temp, this._view_matrix );
	if(this._root && this._root.transform)
		mat4.multiply(temp, temp, this._root.transform.getGlobalMatrixRef() );
	return mat4.rotateVec3(dest, temp, v );
}

/**
* returns the eye (position of the camera) in global coordinates
* @method getEye
* @param {vec3} out output vector [optional]
* @return {vec3} position in global coordinates
*/
Camera.prototype.getEye = function( out )
{
	out = out || vec3.create();
	out.set( this._eye );
	if(this._root && this._root.transform)
	{
		return this._root.transform.getGlobalPosition( out );
		//return mat4.multiplyVec3(eye, this._root.transform.getGlobalMatrixRef(), eye );
	}
	return out;
}


/**
* returns the center of the camera (position where the camera is pointing) in global coordinates
* @method getCenter
* @param {vec3} out output vector [optional]
* @return {vec3} position in global coordinates
*/
Camera.prototype.getCenter = function( out )
{
	out = out || vec3.create();

	if(this._root && this._root.transform)
	{
		out[0] = out[1] = 0; out[2] = -1;
		return mat4.multiplyVec3(out, this._root.transform.getGlobalMatrixRef(), out );
	}

	out.set( this._center );
	return out;
}

/**
* returns the front vector of the camera
* @method getFront
* @param {vec3} out output vector [optional]
* @return {vec3} position in global coordinates
*/
Camera.prototype.getFront = function( out )
{
	out = out || vec3.create();

	if(this._root && this._root.transform)
	{
		out[0] = out[1] = 0; out[2] = -1;
		return mat4.rotateVec3(out, this._root.transform.getGlobalMatrixRef(), out );
	}

	vec3.sub( out, this._center, this._eye ); 
	return vec3.normalize(out, out);
}

/**
* returns the up vector of the camera
* @method getUp
* @param {vec3} out output vector [optional]
* @return {vec3} position in global coordinates
*/
Camera.prototype.getUp = function( out )
{
	out = out || vec3.create();
	out.set( this._up );

	if(this._root && this._root.transform)
	{
		return mat4.rotateVec3( out, this._root.transform.getGlobalMatrixRef(), out );
	}
	return out;
}

/**
* returns the top vector of the camera (different from up, this one is perpendicular to front and right)
* @method getTop
* @param {vec3} out output vector [optional]
* @return {vec3} position in global coordinates
*/
Camera.prototype.getTop = function( out )
{
	out = out || vec3.create();
	var front = vec3.sub( vec3.create(), this._center, this._eye ); 
	var right = vec3.cross( vec3.create(), this._up, front );
	var top = vec3.cross( out, front, right );
	vec3.normalize(top,top);
	if(this._root && this._root.transform && this._root._parent)
		return mat4.rotateVec3( top, this._root.transform.getGlobalMatrixRef(), top );
	return top;
}

/**
* returns the right vector of the camera 
* @method getRight
* @param {vec3} out output vector [optional]
* @return {vec3} position in global coordinates
*/
Camera.prototype.getRight = function( out )
{
	out = out || vec3.create();
	var front = vec3.sub( vec3.create(), this._center, this._eye ); 
	var right = vec3.cross( out, this._up, front );
	vec3.normalize(right,right);
	if(this._root && this._root.transform && this._root._parent)
		return mat4.rotateVec3( right, this._root.transform.getGlobalMatrixRef(), right );
	return right;
}

//DEPRECATED: use property eye instead

Camera.prototype.setEye = function(v)
{
	this._eye.set( v );
	this._must_update_view_matrix = true;
}

Camera.prototype.setCenter = function(v)
{
	this._center.set( v );
	this._must_update_view_matrix = true;
}

/**
* set camera in perspective mode and sets the properties
* @method setPerspective
* @param {number} fov in degrees
* @param {number} aspect the aspect modifier (not the real final aspect, leave it to one)
* @param {number} near distance
* @param {number} far distance
*/
Camera.prototype.setPerspective = function( fov, aspect, near, far )
{
	this._fov = fov;
	this._aspect = aspect;
	this._near = near;
	this._far = far;
	this._type = Camera.PERSPECTIVE;
	this._must_update_projection_matrix = true;
}

/**
* set camera in orthographic mode and sets the planes
* @method setOrthographic
* @param {number} left
* @param {number} right
* @param {number} bottom
* @param {number} top
* @param {number} near
* @param {number} far
*/
Camera.prototype.setOrthographic = function( left,right, bottom,top, near, far )
{
	this._near = near;
	this._far = far;
	this._ortho.set([left,right,bottom,top]);
	this._type = Camera.ORTHO2D;
	this._must_update_projection_matrix = true;
}

/**
* moves the camera by adding the delta vector to center and eye
* @method move
* @param {vec3} delta
*/
Camera.prototype.move = function(v)
{
	vec3.add(this._center, this._center, v);
	vec3.add(this._eye, this._eye, v);
	this._must_update_view_matrix = true;
}

/**
* rotate the camera around its center
* @method rotate
* @param {number} angle_in_deg
* @param {vec3} axis
* @param {boolean} in_local_space allows to specify if the axis is in local space or global space
*/
Camera.prototype.rotate = function(angle_in_deg, axis, in_local_space)
{
	if(in_local_space)
		this.getLocalVector(axis, axis);

	var R = quat.setAxisAngle( quat.create(), axis, angle_in_deg * 0.0174532925 );
	var front = vec3.subtract( vec3.create(), this._center, this._eye );

	vec3.transformQuat(front, front, R );
	vec3.add(this._center, this._eye, front);
	this._must_update_view_matrix = true;
}

/**
* Rotates the camera eye around a center
* @method orbit
* @param {number} angle_in_deg
* @param {vec3} axis
* @param {vec3} center optional
*/
Camera.prototype.orbit = function(angle_in_deg, axis, center)
{
	center = center || this._center;
	var R = quat.setAxisAngle( quat.create(), axis, angle_in_deg * 0.0174532925 );
	var front = vec3.subtract( vec3.create(), this._eye, center );
	vec3.transformQuat(front, front, R );
	vec3.add(this._eye, center, front);
	this._must_update_view_matrix = true;
}

//this is too similar to setDistanceToCenter, must be removed
Camera.prototype.orbitDistanceFactor = function(f, center)
{
	center = center || this._center;
	var front = vec3.subtract( vec3.create(), this._eye, center );
	vec3.scale(front, front, f);
	vec3.add(this._eye, center, front);
	this._must_update_view_matrix = true;
}

/**
* changes the distance between eye and center ( it could move the center or the eye, depending on the parameters )
* @method setDistanceToCenter
* @param {number} new_distance
* @param {boolean} move_eye if this is true it moves the eye closer, otherwise it moves the center closer to the eye
*/
Camera.prototype.setDistanceToCenter = function( new_distance, move_eye )
{
	if(this._root)
	{
		console.warn("cannot use setDistanceToCenter in a camera attached to a node");
		return;
	}

	var front = vec3.sub( vec3.create(), this._center, this._eye );
	var dist = vec3.length( front );
	if(move_eye)
		vec3.scaleAndAdd( this._eye, this._center, front, -new_distance / dist  );
	else
		vec3.scaleAndAdd( this._center, this._eye, front, new_distance / dist );
	this._must_update_view_matrix = true;
}

Camera.prototype.setOrientation = function(q, use_vr)
{
	var center = this.getCenter();
	var eye = this.getEye();
	var up = [0,1,0];

	var to_target = vec3.sub( vec3.create(), center, eye );
	var dist = vec3.length( to_target );

	var front = null;
	front = vec3.fromValues(0,0,-dist);

	if(use_vr)
	{
		vec3.rotateY( front, front, Math.PI * -0.5 );
		vec3.rotateY( up, up, Math.PI * -0.5 );
	}

	vec3.transformQuat(front, front, q);
	vec3.transformQuat(up, up, q);

	if(use_vr)
	{
		vec3.rotateY( front, front, Math.PI * 0.5 );
		vec3.rotateY( up, up, Math.PI * 0.5 );
	}

	this.center = vec3.add( vec3.create(), eye, front );
	this.up = up;

	this._must_update_view_matrix = true;
}

Camera.prototype.setEulerAngles = function(yaw,pitch,roll)
{
	var q = quat.create();
	quat.fromEuler(q, [yaw, pitch, roll] );
	this.setOrientation(q);
}

Camera.prototype.fromViewmatrix = function(mat)
{
	var M = mat4.invert( mat4.create(), mat );
	this.eye = vec3.transformMat4(vec3.create(),vec3.create(),M);
	this.center = vec3.transformMat4(vec3.create(),[0,0,-1],M);
	this.up = mat4.rotateVec3( vec3.create(), M, [0,1,0] );
	this._must_update_view_matrix = true;
}

/**
* Sets the viewport in pixels (using the gl.canvas as reference)
* @method setViewportInPixels
* @param {number} left
* @param {number} right
* @param {number} width
* @param {number} height
*/
Camera.prototype.setViewportInPixels = function(left,bottom,width,height)
{
	this._viewport[0] = left / gl.canvas.width;
	this._viewport[1] = bottom / gl.canvas.height;
	this._viewport[2] = width / gl.canvas.width;
	this._viewport[3] = height / gl.canvas.height;
}


/**
* Converts from 3D to 2D
* @method project
* @param {vec3} vec 3D position we want to proyect to 2D
* @param {vec4} [viewport=null] viewport info (if omited full canvas viewport is used)
* @param {vec3} result where to store the result, if omited it is created
* @return {vec3} the coordinates in 2D
*/

Camera.prototype.project = function( vec, viewport, result, skip_reverse )
{
	result = result || vec3.create();

	viewport = this.getLocalViewport(viewport);

	if( this._must_update_view_matrix || this._must_update_projection_matrix )
		this.updateMatrices();

	//from https://github.com/hughsk/from-3d-to-2d/blob/master/index.js
	var m = this._viewprojection_matrix;

	vec3.project( result, vec, this._viewprojection_matrix, viewport );
	if(!skip_reverse)
		result[1] = viewport[3] - result[1] + viewport[1]*2; //why 2? no idea, but it works :(
	return result;
}

/**
* Converts from 2D to 3D
* @method unproject
* @param {vec3} vec 2D position we want to proyect to 3D
* @param {vec4} [viewport=null] viewport info (if omited full canvas viewport is used)
* @param {vec3} result where to store the result, if omited it is created
* @return {vec3} the coordinates in 2D
*/

Camera.prototype.unproject = function( vec, viewport, result )
{
	viewport = this.getLocalViewport(viewport);
	if( this._must_update_view_matrix || this._must_update_projection_matrix )
		this.updateMatrices();
	return vec3.unproject(result || vec3.create(), vec, this._viewprojection_matrix, viewport );
}

/**
* returns the viewport in pixels applying the local camera viewport to the full viewport of the canvas
* @method getLocalViewport
* @param {vec4} [viewport=null] viewport info, otherwise the canvas dimensions will be used (not the current viewport)
* @param {vec4} [result=vec4] where to store the result, if omited it is created
* @return {vec4} the viewport info of the camera in pixels
*/
Camera.prototype.getLocalViewport = function( viewport, result )
{
	result = result || vec4.create();

	//if no viewport specified, use the full canvas viewport as reference
	if(!viewport)
	{
		result[0] = gl.canvas.width * this._viewport[0]; //asume starts in 0
		result[1] = gl.canvas.height * this._viewport[1]; //asume starts in 0
		result[2] = gl.canvas.width * this._viewport[2];
		result[3] = gl.canvas.height * this._viewport[3];
		return result;
	}

	//apply viewport
	result[0] = Math.floor(viewport[2] * this._viewport[0] + viewport[0]);
	result[1] = Math.floor(viewport[3] * this._viewport[1] + viewport[1]);
	result[2] = Math.ceil(viewport[2] * this._viewport[2]);
	result[3] = Math.ceil(viewport[3] * this._viewport[3]);
	return result;
}

/**
* given an x and y position, returns the ray {start, dir}
* @method getRayInPixel
* @param {number} x
* @param {number} y
* @param {vec4} viewport viewport coordinates (if omited full viewport is used)
* @param {boolean} skip_local_viewport ignore the local camera viewport configuration when computing the viewport
* @return {Object} {start:vec3, dir:vec3}
*/
Camera.prototype.getRayInPixel = function(x,y, viewport, skip_local_viewport )
{
	//apply camera viewport
	if(!skip_local_viewport)
		viewport = this.getLocalViewport( viewport, this._viewport_in_pixels );

	if( this._must_update_view_matrix || this._must_update_projection_matrix )
		this.updateMatrices();
	var eye = this.getEye();
	var pos = vec3.unproject(vec3.create(), [x,y,1], this._viewprojection_matrix, viewport );

	if(this.type == Camera.ORTHOGRAPHIC)
		eye = vec3.unproject(eye, [x,y,0], this._viewprojection_matrix, viewport );

	var dir = vec3.subtract( pos, pos, eye );
	vec3.normalize(dir, dir);
	return { start: eye, direction: dir };
}

/**
* Returns true if the 2D point (in screen space coordinates) is inside the camera viewport area
* @method isPointInCamera
* @param {number} x
* @param {number} y
* @param {vec4} viewport viewport coordinates (if omited full viewport is used)
* @return {boolean} 
*/
Camera.prototype.isPointInCamera = function( x, y, viewport )
{
	var v = this.getLocalViewport( viewport, this._viewport_in_pixels );
	if( x < v[0] || x > v[0] + v[2] ||
		y < v[1] || y > v[1] + v[3] )
		return false;
	return true;
}

Camera.prototype.configure = function(o)
{
	if(o.uid !== undefined) this.uid = o.uid;
	if(o.layers !== undefined) this.layers = o.layers;

	if(o.enabled !== undefined) this.enabled = o.enabled;
	if(o.type !== undefined) this._type = o.type;

	if(o.eye !== undefined) this._eye.set(o.eye);
	if(o.center !== undefined) this._center.set(o.center);
	if(o.up !== undefined) this._up.set(o.up);

	if(o.near !== undefined) this._near = o.near;
	if(o.far !== undefined) this._far = o.far;
	if(o.fov !== undefined) this._fov = o.fov;
	if(o.aspect !== undefined) this._aspect = o.aspect;
	if(o.final_aspect !== undefined) this._final_aspect = o.final_aspect;
	if(o.frustum_size !== undefined) this._frustum_size = o.frustum_size;
	if(o.viewport !== undefined) this._viewport.set( o.viewport );

	if(o.render_to_texture !== undefined) this.render_to_texture = o.render_to_texture;
	if(o.texture_name !== undefined) this.texture_name = o.texture_name;
	if(o.texture_size && o.texture_size.length == 2) this.texture_size.set(o.texture_size);
	if(o.texture_high !== undefined) this.texture_high = o.texture_high;
	if(o.texture_clone !== undefined) this.texture_clone = o.texture_clone;

	this.updateMatrices();
}

Camera.prototype.serialize = function()
{
	var o = {
		uid: this.uid,
		layers: this.layers,
		enabled: this.enabled,
		type: this._type,
		eye: vec3.toArray(this._eye),
		center: vec3.toArray(this._center),
		up: vec3.toArray(this._up),
		near: this._near,
		far: this._far,
		fov: this._fov,
		aspect: this._aspect,
		frustum_size: this._frustum_size,
		viewport: toArray( this._viewport ),
		render_to_texture: this.render_to_texture,
		texture_name: this.texture_name,
		texture_size:  toArray( this.texture_size ),
		texture_high: this.texture_high,
		texture_clone: this.texture_clone
	};

	//clone
	return o;
}

//Layer stuff
Camera.prototype.checkLayersVisibility = function( layers )
{
	return (this.layers & layers) !== 0;
}

Camera.prototype.getLayers = function()
{
	var r = [];
	for(var i = 0; i < 32; ++i)
	{
		if( this.layers & (1<<i) )
			r.push( this._root.scene.layer_names[i] || ("layer"+i) );
	}
	return r;
}

Camera.prototype.setLayer = function(num, value) 
{
	var f = 1<<num;
	this.layers = (this.layers & (~f));
	if(value)
		this.layers |= f;
}

Camera.prototype.isInLayer = function(num)
{
	return (this.layers & (1<<num)) !== 0;
}

//Mostly used for gizmos
Camera.prototype.getTransformMatrix = function( element )
{
	if( this._root && this._root.transform )
		return null; //use the node transform

	var p = null;
	if (element == "center")
		p = this._center;
	else
		p = this._eye;

	var T = mat4.create();
	mat4.setTranslation( T, p );
	return T;
}

Camera.prototype.applyTransformMatrix = function( matrix, center, element )
{
	if( this._root && this._root.transform )
		return false; //ignore transform

	var p = null;
	if (element == "center")
		p = this._center;
	else
		p = this._eye;

	mat4.multiplyVec3( p, matrix, p );
	return true;
}

//Rendering stuff ******************************************

//used when rendering to a texture
Camera.prototype.startFBO = function()
{
	if(!this.render_to_texture || !this.texture_name)
		return;

	var width = this.texture_size[0] || gl.canvas.width;
	var height = this.texture_size[1] || gl.canvas.height;
	var use_high_precision = this.texture_high;

	//Create texture
	var type = use_high_precision ? gl.HIGH_PRECISION_FORMAT : gl.UNSIGNED_BYTE;
	if(!this._texture || this._texture.width != width || this._texture.height != height || this._texture.type != type)
	{
		var isPOT = (isPowerOfTwo(width) && isPowerOfTwo(height));
		this._texture = new GL.Texture( width, height, { format: gl.RGB, wrap: isPOT ? gl.REPEAT : gl.CLAMP_TO_EDGE, filter: isPOT ? gl.LINEAR : gl.NEAREST, type: type });
	}
	var texture = this._texture;

	//save old
	this._old_fbo = gl.getParameter( gl.FRAMEBUFFER_BINDING );
	if(!this._old_viewport)
		this._old_viewport = vec4.create();
	this._old_viewport.set( gl.viewport_data );

	//Setup FBO
	this._fbo = this._fbo || gl.createFramebuffer();
	gl.bindFramebuffer( gl.FRAMEBUFFER, this._fbo );

	gl.viewport(0, 0, width, height );
	LS.Renderer._full_viewport.set( [0,0,width,height] );
	LS.Renderer.global_aspect = (gl.canvas.width / gl.canvas.height) / (texture.width / texture.height); //sure?

	//depth renderbuffer
	var renderbuffer = this._renderbuffer = this._renderbuffer || gl.createRenderbuffer();
	if(renderbuffer.width != width || renderbuffer.height != height)
	{
		renderbuffer.width = width;
		renderbuffer.height = height;
	}
	gl.bindRenderbuffer(gl.RENDERBUFFER, renderbuffer );
	gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);

	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture.handler, 0);
	gl.framebufferRenderbuffer( gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, renderbuffer );
}

Camera.prototype.endFBO = function()
{
	if(!this.render_to_texture || !this.texture_name)
		return;

	//restore
	gl.bindFramebuffer(gl.FRAMEBUFFER, this._old_fbo);
	LS.Renderer.global_aspect = 1.0;
	this._old_fbo = null;

	//generate mipmaps
	if ( gl.NEAREST_MIPMAP_NEAREST <= this._texture.minFilter && this._texture.minFilter <= gl.LINEAR_MIPMAP_LINEAR )
	{
		this._texture.bind(0);
		gl.generateMipmap( this._texture.texture_type );
	}

	var v = this._old_viewport;
	gl.viewport( v[0], v[1], v[2], v[3] );
	LS.Renderer._full_viewport.set( v );

	//save texture
	if(this.texture_name)
	{
		var texture = this._texture;
		//cloning the texture allows to use the same texture in the scene (but uses more memory)
		if(this.texture_clone)
		{
			if(!this._texture_clone || this._texture_clone.width != texture.width || this._texture_clone.height != texture.height || this._texture_clone.type != texture.type)
				this._texture_clone = new GL.Texture( texture.width, texture.height, { format: gl.RGB, filter: gl.LINEAR, type: texture.type });
			texture.copyTo( this._texture_clone );
			texture = this._texture_clone;
		}
		LS.ResourcesManager.registerResource( this.texture_name, texture );
	}
}

Camera.prototype.fillCameraShaderUniforms = function( scene )
{
	var uniforms = this._uniforms;
	uniforms.u_camera_planes[0] = this.near;
	uniforms.u_camera_planes[1] = this.far;
	if(this.type == Camera.PERSPECTIVE)
		uniforms.u_camera_perspective.set( [this.fov * DEG2RAD, 512 / Math.tan( this.fov * DEG2RAD ) ] );
	else
		uniforms.u_camera_perspective.set( [ this._frustum_size, 512 / this._frustum_size ] );
	uniforms.u_camera_perspective[2] = this._projection_matrix[5]; //[1][1]

	this.getEye( uniforms.u_camera_eye );
	this.getFront( uniforms.u_camera_front );

	return uniforms;
},

LS.registerComponent(Camera);
LS.Camera = Camera;
/**
* This component allow to create basic FX
* @class CameraFX
* @param {Object} o object with the serialized info
*/
function CameraFX(o)
{
	this.enabled = true;

	this.fx = new LS.TextureFX( o ? o.fx : null );

	this.use_viewport_size = true;
	this.use_high_precision = false;
	this.camera_uid = null;
	this.use_antialiasing = false;

	if(o)
		this.configure(o);
}

CameraFX.icon = "mini-icon-fx.png";
CameraFX["@camera_uid"] = { type: "String" };

Object.defineProperty( CameraFX.prototype, "use_antialiasing", { 
	set: function(v) { this.fx.apply_fxaa = v; },
	get: function() { return this.fx.apply_fxaa; },
	enumerable: true
});

CameraFX.prototype.configure = function(o)
{
	this.enabled = !!o.enabled;
	this.use_viewport_size = !!o.use_viewport_size;
	this.use_high_precision = !!o.use_high_precision;
	this.camera_uid = o.camera_uid;
	if(o.fx)
		this.fx.configure(o.fx);
}

CameraFX.prototype.serialize = function()
{
	return { 
		enabled: this.enabled,
		use_high_precision: this.use_high_precision,
		use_viewport_size: this.use_viewport_size,
		camera_uid: this.camera_uid,
		fx: this.fx.serialize()
	};
}

CameraFX.prototype.getResources = function(res)
{
	//TODO
	return res;
}

CameraFX.prototype.addFX = function( name )
{
	this.fx.addFX(name);
}

CameraFX.prototype.getFX = function(index)
{
	return this.fx.getFX( index );
}

CameraFX.prototype.moveFX = function( fx, offset )
{
	return this.fx.moveFX(fx,offset);
}

CameraFX.prototype.removeFX = function( fx )
{
	return this.fx.removeFX( fx );
}

CameraFX.prototype.onAddedToScene = function( scene )
{
	LEvent.bind( scene, "enableFrameBuffer", this.onBeforeRender, this );
	LEvent.bind( scene, "showFrameBuffer", this.onAfterRender, this );
}

CameraFX.prototype.onRemovedFromScene = function( scene )
{
	LEvent.unbind( scene, "enableFrameBuffer", this.onBeforeRender, this );
	LEvent.unbind( scene, "showFrameBuffer", this.onAfterRender, this );

	if( this._binded_camera )
	{
		LEvent.unbindAll( this._binded_camera, this );
		this._binded_camera = null;
	}
}

//hook the RFC
CameraFX.prototype.onBeforeRender = function(e, render_settings)
{
	if(!this.enabled)
	{
		if( this._binded_camera )
		{
			LEvent.unbindAll( this._binded_camera, this );
			this._binded_camera = null;
		}
		return;
	}

	//FBO for one camera
	var camera = this._root.camera;
	if(this.camera_uid)
	{
		if( !this._binded_camera || this._binded_camera.uid != this.camera_uid )
			camera = this._binded_camera;
		else
			camera = LS.GlobalScene.findComponentByUId( this.camera_uid );
	}

	if(!camera)
	{
		if( this._binded_camera )
		{
			LEvent.unbindAll( this._binded_camera, this );
			this._binded_camera = null;
		}
		return;
	}

	if(camera && camera != this._binded_camera)
	{
		if(this._binded_camera)
			LEvent.unbindAll( this._binded_camera, this );
		LEvent.bind( camera, "enableFrameBuffer", this.enableCameraFBO, this );
		LEvent.bind( camera, "showFrameBuffer", this.showCameraFBO, this );
	}
	this._binded_camera = camera;

	//this.enableGlobalFBO( render_settings );
}

CameraFX.prototype.onAfterRender = function( e, render_settings )
{
	if(!this.enabled)
		return;
	//this.showFBO();
}

CameraFX.prototype.enableCameraFBO = function(e, render_settings )
{
	if(!this.enabled)
		return;

	var RFC = this._renderFrameContainer;
	if(!RFC)
		RFC = this._renderFrameContainer = new LS.RenderFrameContainer();
	var camera = this._binded_camera;
	
	var viewport = this._viewport = camera.getLocalViewport( null, this._viewport );
	RFC.setSize( viewport[2], viewport[3] );
	RFC.use_high_precision = this.use_high_precision;
	RFC.preRender( render_settings );

	render_settings.ignore_viewports = true;
}

CameraFX.prototype.showCameraFBO = function(e, render_settings )
{
	if(!this.enabled)
		return;
	render_settings.ignore_viewports = false;
	this.showFBO();
}

/*
CameraFX.prototype.enableGlobalFBO = function( render_settings )
{
	if(!this.enabled)
		return;

	var RFC = this._renderFrameContainer;
	if(!RFC)
		RFC = this._renderFrameContainer = new LS.RenderFrameContainer();

	//configure
	if(this.use_viewport_size)
		RFC.useCanvasSize();
	RFC.use_high_precision = this.use_high_precision;

	RFC.preRender( render_settings );
}
*/

CameraFX.prototype.showFBO = function()
{
	if(!this.enabled)
		return;

	this._renderFrameContainer.endFBO();

	if( this._viewport )
	{
		gl.setViewport( this._viewport );
		this.applyFX();
		gl.setViewport( this._renderFrameContainer._fbo._old_viewport );
	}
	else
		this.applyFX();
}


CameraFX.prototype.applyFX = function()
{
	var RFC = this._renderFrameContainer;

	var color_texture = RFC.color_texture;
	var depth_texture = RFC.depth_texture;

	this.fx.apply_fxaa = this.use_antialiasing;
	this.fx.applyFX( color_texture, null, { depth_texture: depth_texture } );
}

LS.registerComponent( CameraFX );
/**
* This component allow to create basic FX applied to the whole scene
* @class GlobalFX
* @param {Object} o object with the serialized info
*/
function GlobalFX(o)
{
	this.enabled = true;

	this.fx = new LS.TextureFX( o ? o.fx : null );

	this.use_viewport_size = true;
	this.use_high_precision = false;
	this.use_antialiasing = false;

	if(o)
		this.configure(o);
}

GlobalFX.icon = "mini-icon-fx.png";

Object.defineProperty( GlobalFX.prototype, "use_antialiasing", { 
	set: function(v) { this.fx.apply_fxaa = v; },
	get: function() { return this.fx.apply_fxaa; },
	enumerable: true
});

GlobalFX.prototype.configure = function(o)
{
	this.enabled = !!o.enabled;
	this.use_viewport_size = !!o.use_viewport_size;
	this.use_high_precision = !!o.use_high_precision;
	if(o.fx)
		this.fx.configure(o.fx);
}

GlobalFX.prototype.serialize = function()
{
	return { 
		enabled: this.enabled,
		use_high_precision: this.use_high_precision,
		use_viewport_size: this.use_viewport_size,
		fx: this.fx.serialize()
	};
}

GlobalFX.prototype.getResources = function(res)
{
	//TODO
	return res;
}

GlobalFX.prototype.addFX = function( name )
{
	this.fx.addFX(name);
}

GlobalFX.prototype.getFX = function(index)
{
	return this.fx.getFX( index );
}

GlobalFX.prototype.moveFX = function( fx, offset )
{
	return this.fx.moveFX(fx,offset);
}

GlobalFX.prototype.removeFX = function( fx )
{
	return this.fx.removeFX( fx );
}

GlobalFX.prototype.onAddedToScene = function( scene )
{
	LEvent.bind( scene, "enableFrameBuffer", this.onBeforeRender, this );
	LEvent.bind( scene, "showFrameBuffer", this.onAfterRender, this );
}

GlobalFX.prototype.onRemovedFromScene = function( scene )
{
	LEvent.unbind( scene, "enableFrameBuffer", this.onBeforeRender, this );
	LEvent.unbind( scene, "showFrameBuffer", this.onAfterRender, this );
}

//hook the RFC
GlobalFX.prototype.onBeforeRender = function(e, render_settings)
{
	if(!this.enabled)
		return;

	this.enableGlobalFBO( render_settings );
}

GlobalFX.prototype.onAfterRender = function( e, render_settings )
{
	if(!this.enabled)
		return;
	this.showFBO();
}

GlobalFX.prototype.enableGlobalFBO = function( render_settings )
{
	if(!this.enabled)
		return;

	var RFC = this._renderFrameContainer;
	if(!RFC)
		RFC = this._renderFrameContainer = new LS.RenderFrameContainer();

	//configure
	if(this.use_viewport_size)
		RFC.useCanvasSize();
	RFC.use_high_precision = this.use_high_precision;
	RFC.preRender( render_settings );
}

GlobalFX.prototype.showFBO = function()
{
	if(!this.enabled)
		return;

	this._renderFrameContainer.endFBO();

	if( this._viewport )
	{
		gl.setViewport( this._viewport );
		this.applyFX();
		gl.setViewport( this._renderFrameContainer._fbo._old_viewport );
	}
	else
		this.applyFX();
}

GlobalFX.prototype.applyFX = function()
{
	var RFC = this._renderFrameContainer;

	var color_texture = RFC.color_texture;
	var depth_texture = RFC.depth_texture;

	this.fx.apply_fxaa = this.use_antialiasing;
	this.fx.applyFX( color_texture, null, { depth_texture: depth_texture } );
}

LS.registerComponent( GlobalFX );
//***** LIGHT ***************************

/**
* Light that contains the info about the camera
* @class Light
* @constructor
* @param {Object} object to configure from
*/

function Light(o)
{
	/**
	* Position of the light in world space
	* @property position
	* @type {[[x,y,z]]}
	* @default [0,0,0]
	*/
	this._position = vec3.create();
	/**
	* Position where the light is pointing at (in world space)
	* @property target
	* @type {[[x,y,z]]}
	* @default [0,0,1]
	*/
	this._target = vec3.fromValues(0,0,1);
	/**
	* Up vector (in world coordinates)
	* @property up
	* @type {[[x,y,z]]}
	* @default [0,1,0]
	*/
	this._up = vec3.fromValues(0,1,0);

	/**
	* Enabled
	* @property enabled
	* @type {Boolean}
	* @default true
	*/
	this.enabled = true;

	/**
	* Near distance
	* @property near
	* @type {Number}
	* @default 1
	*/
	this.near = 1;
	/**
	* Far distance
	* @property far
	* @type {Number}
	* @default 1000
	*/

	this.far = 500;
	/**
	* Angle for the spot light inner apperture
	* @property angle
	* @type {Number}
	* @default 45
	*/
	this.angle = 45; //spot cone
	/**
	* Angle for the spot light outer apperture
	* @property angle_end
	* @type {Number}
	* @default 60
	*/
	this.angle_end = 60; //spot cone end

	this.constant_diffuse = false;
	this.use_specular = true;
	this.linear_attenuation = false;
	this.range_attenuation = true;
	this.att_start = 0;
	this.att_end = 1000;
	this.offset = 0;
	this.spot_cone = true;

	this.projective_texture = null;

	this._attenuation_info = new Float32Array([ this.att_start, this.att_end ]);

	//use target (when attached to node)
	this.use_target = false;

	/**
	* The color of the light
	* @property color
	* @type {[[r,g,b]]}
	* @default [1,1,1]
	*/
	this._color = vec3.fromValues(1,1,1);
	/**
	* The intensity of the light
	* @property intensity
	* @type {Number}
	* @default 1
	*/
	this.intensity = 1;

	/**
	* If the light cast shadows
	* @property cast_shadows
	* @type {Boolean}
	* @default false
	*/
	this.cast_shadows = false;
	this.shadow_bias = 0.05;
	this.shadowmap_resolution = 0; //use automatic shadowmap size
	this.type = Light.OMNI;
	this.frustum_size = 50; //ortho

	this.extra_light_shader_code = null;
	this.extra_texture = null;

	//vectors in world space
	this._front = vec3.clone( Light.FRONT_VECTOR );
	this._right = vec3.clone( Light.RIGHT_VECTOR );
	this._top = vec3.clone( Light.UP_VECTOR );

	//for caching purposes
	this._query = new ShaderQuery();
	this._uniforms = {};

	if(o) 
	{
		this.configure(o);
		if(o.shadowmap_resolution !== undefined)
			this.shadowmap_resolution = parseInt(o.shadowmap_resolution); //LEGACY: REMOVE
	}
}

Light["@projective_texture"] = { type:"Texture" };
Light["@extra_texture"] = { type:"Texture" };

Object.defineProperty( Light.prototype, 'position', {
	get: function() { return this._position; },
	set: function(v) { this._position.set(v); /*this._must_update_matrix = true;*/ },
	enumerable: true
});

Object.defineProperty( Light.prototype, 'target', {
	get: function() { return this._target; },
	set: function(v) { this._target.set(v); /*this._must_update_matrix = true;*/ },
	enumerable: true
});

Object.defineProperty( Light.prototype, 'up', {
	get: function() { return this._up; },
	set: function(v) { this._up.set(v); /*this._must_update_matrix = true;*/ },
	enumerable: true
});

Object.defineProperty( Light.prototype, 'color', {
	get: function() { return this._color; },
	set: function(v) { this._color.set(v); /*this._must_update_matrix = true;*/ },
	enumerable: true
});

//do not change
Light.FRONT_VECTOR = new Float32Array([0,0,-1]); //const
Light.RIGHT_VECTOR = new Float32Array([1,0,0]); //const
Light.UP_VECTOR = new Float32Array([0,1,0]); //const

Light.OMNI = 1;
Light.SPOT = 2;
Light.DIRECTIONAL = 3;

Light.DEFAULT_SHADOWMAP_RESOLUTION = 1024;
Light.DEFAULT_DIRECTIONAL_FRUSTUM_SIZE = 50;

Light.coding_help = "\
LightInfo LIGHT -> light info before applying equation\n\
Input IN -> info about the mesh\n\
SurfaceOutput o -> info about the surface properties of this pixel\n\
\n\
struct LightInfo {\n\
	vec3 Color;\n\
	vec3 Ambient;\n\
	float Diffuse; //NdotL\n\
	float Specular; //RdotL\n\
	vec3 Emission;\n\
	vec3 Reflection;\n\
	float Attenuation;\n\
	float Shadow; //1.0 means fully lit\n\
};\n\
\n\
struct Input {\n\
	vec4 color;\n\
	vec3 vertex;\n\
	vec3 normal;\n\
	vec2 uv;\n\
	vec2 uv1;\n\
	\n\
	vec3 camPos;\n\
	vec3 viewDir;\n\
	vec3 worldPos;\n\
	vec3 worldNormal;\n\
	vec4 screenPos;\n\
};\n\
\n\
struct SurfaceOutput {\n\
	vec3 Albedo;\n\
	vec3 Normal;\n\
	vec3 Ambient;\n\
	vec3 Emission;\n\
	float Specular;\n\
	float Gloss;\n\
	float Alpha;\n\
	float Reflectivity;\n\
};\n\
";

Light.prototype.onAddedToNode = function(node)
{
	if(!node.light) node.light = this;

	LEvent.bind(node, "collectLights", this.onCollectLights, this );
}

Light.prototype.onRemovedFromNode = function(node)
{
	if(node.light == this) delete node.light;
	delete ResourcesManager.textures[":shadowmap_" + this.uid ];
}

Light.prototype.onCollectLights = function(e, lights)
{
	if(!this.enabled)
		return;

	//add to lights vector
	lights.push(this);
}

Light._temp_matrix = mat4.create();
Light._temp2_matrix = mat4.create();
Light._temp3_matrix = mat4.create();
Light._temp_position = vec3.create();
Light._temp_target = vec3.create();
Light._temp_up = vec3.create();
Light._temp_front = vec3.create();

//Used to create a camera from a light
Light.prototype.updateLightCamera = function()
{
	if(!this._light_camera)
		this._light_camera = new Camera();

	var camera = this._light_camera;
	camera.eye = this.getPosition(Light._temp_position);
	camera.center = this.getTarget(Light._temp_target);

	var up = this.getUp(Light._temp_up);
	var front = this.getFront(Light._temp_front);
	if( Math.abs( vec3.dot(front,up) ) > 0.999 ) 
		vec3.set(up,0,0,1);
	camera.up = up;

	camera.type = this.type == Light.DIRECTIONAL ? Camera.ORTHOGRAPHIC : Camera.PERSPECTIVE;

	var closest_far = this.computeShadowmapFar();

	camera._frustum_size = this.frustum_size || Light.DEFAULT_DIRECTIONAL_FRUSTUM_SIZE;
	camera.near = this.near;
	camera.far = closest_far;
	camera.fov = (this.angle_end || 45); //fov is in degrees

	camera.updateMatrices();
	this._light_matrix = camera._viewprojection_matrix;

	/* ALIGN TEXEL OF SHADOWMAP IN DIRECTIONAL
	if(this.type == Light.DIRECTIONAL && this.cast_shadows && this.enabled)
	{
		var shadowmap_resolution = this.shadowmap_resolution || Light.DEFAULT_SHADOWMAP_RESOLUTION;
		var texelSize = frustum_size / shadowmap_resolution;
		view_matrix[12] = Math.floor( view_matrix[12] / texelSize) * texelSize;
		view_matrix[13] = Math.floor( view_matrix[13] / texelSize) * texelSize;
	}
	*/	

	return camera;
}

/**
* Returns the camera that will match the light orientation (taking into account fov, etc), useful for shadowmaps
* @method getLightCamera
* @return {Camera} the camera
*/
Light.prototype.getLightCamera = function()
{
	if(!this._light_camera)
		this.updateLightCamera();
	return this._light_camera;
}

/**
* updates all the important vectors (target, position, etc) according to the node parent of the light
* @method updateVectors
*/
Light.prototype.updateVectors = (function(){
	var temp_v3 = vec3.create();

	return function()
	{
		//if the light is inside the root node of the scene
		if(!this._root || !this._root.transform) 
		{
			//position, target and up are already valid
			 //front
			 //vec3.subtract(this._front, this.position, this.target ); //positive z front
			 vec3.subtract(this._front, this._target, this._position ); //positive z front
			 vec3.normalize(this._front,this._front);
			 //right
			 vec3.normalize( temp_v3, this._up );
			 vec3.cross( this._right, this._front, temp_v3 );
			 //top
			 vec3.cross( this._top, this._right, this._front );
			 return;
		}

		var mat = this._root.transform.getGlobalMatrixRef();

		//position
		mat4.getTranslation( this._position, mat);
		//target
		if (!this.use_target)
			mat4.multiplyVec3( this._target, mat, Light.FRONT_VECTOR ); //right in front of the object
		//up
		mat4.multiplyVec3( this._up, mat, Light.UP_VECTOR ); //right in front of the object

		//vectors
		mat4.rotateVec3( this._front, mat, Light.FRONT_VECTOR ); 
		mat4.rotateVec3( this._right, mat, Light.RIGHT_VECTOR ); 
		vec3.copy( this._top, this.up ); 
	}
})();
/**
* returns a copy of the light position (in global coordinates), if you want local you can access the position property
* @method getPosition
* @param {vec3} output optional
* @return {vec3} the position
*/
Light.prototype.getPosition = function( out )
{
	out = out || vec3.create();
	//if(this._root && this._root.transform) return this._root.transform.transformPointGlobal(this.position, p || vec3.create() );
	if(this._root && this._root.transform) 
		return this._root.transform.getGlobalPosition( out );
	out.set( this._position );
	return out;
}

/**
* returns a copy of the light target (in global coordinates), if you want local you can access the target property
* @method getTarget
* @param {vec3} output optional
* @return {vec3} the target
*/
Light.prototype.getTarget = function( out )
{
	out = out || vec3.create();
	//if(this._root && this._root.transform && !this.use_target) 
	//	return this._root.transform.transformPointGlobal(this.target, p || vec3.create() );
	if(this._root && this._root.transform && !this.use_target) 
		return this._root.transform.transformPointGlobal( Light.FRONT_VECTOR , out);
	out.set( this._target );
	return out;
}

/**
* returns a copy of the light up vector (in global coordinates), if you want local you can access the up property
* @method getUp
* @param {vec3} output optional
* @return {vec3} the up vector
*/
Light.prototype.getUp = function( out )
{
	out = out || vec3.create();

	if(this._root && this._root.transform) 
		return this._root.transform.transformVector( Light.UP_VECTOR , out );
	out.set( this._up );
	return out;
}

/**
* returns a copy of the front vector (in global coordinates)
* @method getFront
* @param {vec3} output optional
* @return {vec3} the front vector
*/
Light.prototype.getFront = function( out ) 
{
	var front = out || vec3.create();
	vec3.subtract(front, this.getPosition(), this.getTarget() ); //front is reversed?
	//vec3.subtract(front, this.getTarget(), this.getPosition() ); //front is reversed?
	vec3.normalize(front, front);
	return front;
}

Light.prototype.getLightRotationMatrix = function()
{

}

Light.prototype.getResources = function (res)
{
	if(this.projective_texture)
		res[ this.projective_texture ] = GL.Texture;
	if(this.extra_texture)
		res[ this.extra_texture ] = GL.Texture;
	return res;
}

Light.prototype.onResourceRenamed = function (old_name, new_name, resource)
{
	if(this.projective_texture == old_name)
		this.projective_texture = new_name;
	if(this.extra_texture == old_name)
		this.extra_texture = new_name;
}

//Layer stuff
Light.prototype.checkLayersVisibility = function( layers )
{
	if(!this._root)
		return false;
	return (this._root.layers & layers) !== 0;
}

Light.prototype.isInLayer = function(num)
{
	if(!this._root)
		return false;
	return (this._root.layers & (1<<num)) !== 0;
}

/**
* This method is called by the LS.Renderer when the light needs to be prepared to be used during render (compute light camera, create shadowmaps, prepare macros, etc)
* @method prepare
* @param {Object} render_settings info about how the scene will be rendered
*/
Light.prototype.prepare = function( render_settings )
{
	var uniforms = this._uniforms;
	var query = this._query;
	query.clear(); //delete all properties (I dont like to generate garbage)

	//projective texture needs the light matrix to compute projection
	if(this.projective_texture || this.cast_shadows)
		this.updateLightCamera();

	if( (!render_settings.shadows_enabled || !this.cast_shadows) && this._shadowmap)
	{
		this._shadowmap = null;
		delete LS.ResourcesManager.textures[":shadowmap_" + this.uid ];
	}

	this.updateVectors();

	//PREPARE MACROS
	if(this.type == Light.DIRECTIONAL)
		query.macros.USE_DIRECTIONAL_LIGHT = "";
	else if(this.type == Light.SPOT)
		query.macros.USE_SPOT_LIGHT = "";
	else //omni
		query.macros.USE_OMNI_LIGHT = "";

	if(this.spot_cone)
		query.macros.USE_SPOT_CONE = "";
	if(this.linear_attenuation)
		query.macros.USE_LINEAR_ATTENUATION = "";
	if(this.range_attenuation)
		query.macros.USE_RANGE_ATTENUATION = "";
	if(this.offset > 0.001)
		query.macros.USE_LIGHT_OFFSET = "";

	if(this.projective_texture)
	{
		var light_projective_texture = this.projective_texture.constructor === String ? LS.ResourcesManager.textures[this.projective_texture] : this.projective_texture;
		if(light_projective_texture)
		{
			if(light_projective_texture.texture_type == gl.TEXTURE_CUBE_MAP)
				query.macros.USE_LIGHT_CUBEMAP = "";
			else
				query.macros.USE_LIGHT_TEXTURE = "";
		}
	}

	if(this.extra_texture)
	{
		var extra_texture = this.extra_texture.constructor === String ? LS.ResourcesManager.textures[this.extra_texture] : this.extra_texture;
		if(extra_texture)
		{
			if(extra_texture.texture_type == gl.TEXTURE_CUBE_MAP)
				query.macros.USE_EXTRA_LIGHT_CUBEMAP = "";
			else
				query.macros.USE_EXTRA_LIGHT_TEXTURE = "";
		}
	}


	//if(vec3.squaredLength( light.color ) < 0.001 || node.flags.ignore_lights)
	//	macros.USE_IGNORE_LIGHT = "";

	//PREPARE UNIFORMS
	if(this.type == Light.DIRECTIONAL || this.type == Light.SPOT)
		uniforms.u_light_front = this._front;
	if(this.type == Light.SPOT)
		uniforms.u_light_angle = [ this.angle * DEG2RAD, this.angle_end * DEG2RAD, Math.cos( this.angle * DEG2RAD * 0.5 ), Math.cos( this.angle_end * DEG2RAD * 0.5 ) ];

	uniforms.u_light_position = this.position;
	uniforms.u_light_color = vec3.scale( uniforms.u_light_color || vec3.create(), this.color, this.intensity );
	this._attenuation_info[0] = this.att_start;
	this._attenuation_info[1] = this.att_end;
	uniforms.u_light_att = this._attenuation_info; //[this.att_start,this.att_end];
	uniforms.u_light_offset = this.offset;

	//extra code
	if(this.extra_light_shader_code)
	{
		var code = null;
		if(this._last_extra_light_shader_code != this.extra_light_shader_code)
		{
			code = LS.Material.processShaderCode( this.extra_light_shader_code );
			this._last_processed_extra_light_shader_code = code;
		}
		else
			code = this._last_processed_extra_light_shader_code;
	}
	else
		this._last_processed_extra_light_shader_code = null;

	//generate shadowmaps
	var must_update_shadowmap = render_settings.update_shadowmaps && render_settings.shadows_enabled && !render_settings.lights_disabled && !render_settings.low_quality;

	if(must_update_shadowmap)
	{
		var cameras = LS.Renderer._visible_cameras;
		var is_inside_one_camera = false;

		if( !render_settings.update_all_shadowmaps && cameras && this.type == Light.OMNI && this.range_attenuation )
		{
			var closest_far = this.computeShadowmapFar();
			for(var i = 0; i < cameras.length; i++)
			{
				if( geo.frustumTestSphere( cameras[i]._frustum_planes, this.position, closest_far ) != CLIP_OUTSIDE )
				{
					is_inside_one_camera = true;
					break;
				}
			}
		}
		else //we only check for omnis, cone frustum collision not developed yet
			is_inside_one_camera = true;

		if( is_inside_one_camera )
			this.generateShadowmap( render_settings );
	}

	if( this._shadowmap && !this.cast_shadows )
		this._shadowmap = null; //remove shadowmap

	this._uniforms = uniforms;
}

/**
* Collects and returns the shader query of the light (some macros have to be computed now because they depend not only on the light, also on the node or material)
* @method getQuery
* @param {RenderInstance} instance the render instance where this light will be applied
* @param {Object} render_settings info about how the scene will be rendered
* @return {ShaderQuery} the macros
*/
Light.prototype.getQuery = function(instance, render_settings)
{
	var query = this._query;

	var use_shadows = this.cast_shadows && this._shadowmap && this._light_matrix != null && !render_settings.shadows_disabled;

	if(!this.constant_diffuse && !instance.material.constant_diffuse)
		query.macros.USE_DIFFUSE_LIGHT = "";
	else
		delete query.macros["USE_DIFFUSE_LIGHT"];

	if(this.use_specular && instance.material.specular_factor > 0)
		query.macros.USE_SPECULAR_LIGHT = "";	
	else
		delete query.macros["USE_SPECULAR_LIGHT"];

	if(use_shadows && instance.flags & RI_RECEIVE_SHADOWS)
	{
		query.macros.USE_SHADOW_MAP = "";
		if(this._shadowmap && this._shadowmap.texture_type == gl.TEXTURE_CUBE_MAP)
			query.macros.USE_SHADOW_CUBEMAP = "";
		if(this.hard_shadows)// || macros.USE_SHADOW_CUBEMAP != null)
			query.macros.USE_HARD_SHADOWS = "";
		query.macros.SHADOWMAP_OFFSET = "";
	}
	else
		delete query.macros["USE_SHADOW_MAP"];

	if(this._last_processed_extra_light_shader_code && (!this.extra_texture || LS.ResourcesManager.getTexture(this.extra_texture)) )
		query.macros["USE_EXTRA_LIGHT_SHADER_CODE"] = this._last_processed_extra_light_shader_code;
	else
		delete query.macros["USE_EXTRA_LIGHT_SHADER_CODE"];

	return query;
}

/**
* Collects and returns the uniforms for the light (some uniforms have to be computed now because they depend not only on the light, also on the node or material)
* @method getUniforms
* @param {RenderInstance} instance the render instance where this light will be applied
* @param {Object} render_settings info about how the scene will be rendered
* @return {Object} the uniforms
*/
Light.prototype.getUniforms = function( instance, render_settings )
{
	var uniforms = this._uniforms;
	var use_shadows = this.cast_shadows && 
					instance.flags & RI_RECEIVE_SHADOWS && 
					this._shadowmap && this._light_matrix != null && 
					!render_settings.shadows_disabled;

	//compute the light mvp
	if(this._light_matrix)
		uniforms.u_lightMatrix = mat4.multiply( uniforms.u_lightMatrix || mat4.create(), this._light_matrix, instance.matrix );

	//projective texture
	if(this.projective_texture)
	{
		var light_projective_texture = this.projective_texture.constructor === String ? ResourcesManager.textures[this.projective_texture] : this.projective_texture;
		if(light_projective_texture)
		{
			if(light_projective_texture.texture_type == gl.TEXTURE_CUBE_MAP)
				uniforms.light_cubemap = light_projective_texture.bind(11); //fixed slot
			else
				uniforms.light_texture = light_projective_texture.bind(11); //fixed slot
			//	uniforms.light_rotation_matrix = 
		}
	}
	else
	{
		delete uniforms["light_texture"];
		delete uniforms["light_cubemap"];
	}

	if(this.extra_texture)
	{
		var extra_texture = this.extra_texture.constructor === String ? LS.ResourcesManager.textures[this.extra_texture] : this.extra_texture;
		if(extra_texture)
		{
			if(extra_texture.texture_type == gl.TEXTURE_CUBE_MAP)
				uniforms.extra_light_cubemap = extra_texture.bind(12); //fixed slot
			else
				uniforms.extra_light_texture = extra_texture.bind(12); //fixed slot
			//	uniforms.light_rotation_matrix = 
		}
	}
	else
	{
		delete uniforms["extra_light_texture"];
		delete uniforms["extra_light_cubemap"];
	}


	//use shadows?
	if(use_shadows)
	{
		var closest_far = this.computeShadowmapFar();
		uniforms.u_shadow_params = [ 1.0 / this._shadowmap.width, this.shadow_bias, this.near, closest_far ];
		uniforms.shadowmap = this._shadowmap.bind(10); //fixed slot
	}
	else
	{
		delete uniforms["u_shadow_params"];
		delete uniforms["shadowmap"];
	}

	return uniforms;
}

/**
* Optimization: instead of using the far plane, we take into account the attenuation to avoid rendering objects where the light will never reach
* @method computeShadowmapFar
* @return {number} distance
*/
Light.prototype.computeShadowmapFar = function()
{
	var closest_far = this.far;

	if( this.type == Light.OMNI )
	{
		//Math.SQRT2 because in a 45º triangle the hypotenuse is sqrt(1+1) * side
		if( this.range_attenuation && (this.att_end * Math.SQRT2) < closest_far)
			closest_far = this.att_end / Math.SQRT2;

		//TODO, if no range_attenuation but linear_attenuation also check intensity to reduce the far
	}
	else 
	{
		if( this.range_attenuation && this.att_end < closest_far)
			closest_far = this.att_end;
	}

	return closest_far;
}

/**
* Computes the max amount of light this object can produce (taking into account every color channel)
* @method computeLightIntensity
* @return {number} intensity
*/
Light.prototype.computeLightIntensity = function()
{
	var max = Math.max( this.color[0], this.color[1], this.color[2] );
	return Math.max(0,max * this.intensity);
}

/**
* Computes the light radius according to the attenuation
* @method computeLightRadius
* @return {number} radius
*/
Light.prototype.computeLightRadius = function()
{
	if(!this.range_attenuation)
		return -1;

	if( this.type == Light.OMNI )
		return this.att_end * Math.SQRT2;

	return this.att_end;
}

/**
* Generates the shadowmap for this light
* @method generateShadowmap
* @return {Object} render_settings
*/
Light.prototype.generateShadowmap = function (render_settings)
{
	if(!this.cast_shadows)
		return;

	var light_intensity = this.computeLightIntensity();
	if( light_intensity < 0.0001 )
		return;

	//create the texture
	var shadowmap_resolution = this.shadowmap_resolution;
	if(shadowmap_resolution == 0)
		shadowmap_resolution = render_settings.default_shadowmap_resolution;

	var tex_type = this.type == Light.OMNI ? gl.TEXTURE_CUBE_MAP : gl.TEXTURE_2D;
	if(this._shadowmap == null || this._shadowmap.width != shadowmap_resolution || this._shadowmap.texture_type != tex_type)
	{
		var format = gl.RGBA; //gl.extensions.WEBGL_depth_texture ? gl.DEPTH_COMPONENT16 : gl.RGBA;
		this._shadowmap = new GL.Texture( shadowmap_resolution, shadowmap_resolution, { texture_type: tex_type, format: format, magFilter: gl.NEAREST, minFilter: gl.NEAREST });
		LS.ResourcesManager.textures[":shadowmap_" + this.uid ] = this._shadowmap; //debug
		if( this._shadowmap.texture_type == gl.TEXTURE_2D )
		{
			if(format == gl.RGBA)
				this._fbo = new GL.FBO( [this._shadowmap] );
			else
				this._fbo = new GL.FBO( null, this._shadowmap );
		}
	}

	LS.Renderer.setRenderPass("shadow");

	//render the scene inside the texture
	if(this.type == Light.OMNI) //render to cubemap
	{
		var closest_far = this.computeShadowmapFar();
		this._shadowmap.unbind(); 
		LS.Renderer.renderToCubemap( this.getPosition(), shadowmap_resolution, this._shadowmap, render_settings, this.near, closest_far );
	}
	else //DIRECTIONAL and SPOTLIGHT
	{
		var shadow_camera = this.getLightCamera();
		LS.Renderer.enableCamera( shadow_camera, render_settings, true );

		// Render the object viewed from the light using a shader that returns the
		// fragment depth.
		this._shadowmap.unbind(); 
		LS.Renderer._current_target = this._shadowmap;
		this._fbo.bind();

		gl.clearColor(0, 0, 0, 0);
		//gl.clearColor(1, 1, 1, 1);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

		//RENDER INSTANCES in the shadowmap
		LS.Renderer.renderInstances( render_settings );

		this._fbo.unbind();
		LS.Renderer._current_target = null;
	}

	LS.Renderer.setRenderPass("color");
}

/**
* It returns a matrix in the position of the given light property (target, position), mostly used for gizmos
* @method getTransformMatrix
* @param {String} element "target" or "position"
* @param {mat4} output [optional]
* @return {mat4} mat4
*/
Light.prototype.getTransformMatrix = function( element, mat )
{
	if( this._root && this._root.transform )
		return null; //use the node transform

	var p = null;
	if (element == "target")
		p = this.target;
	else
		p = this.position;

	var T = mat || mat4.create();
	mat4.setTranslation( T, p );
	return T;
}

/**
* apply a transformation to a given light property, this is done in a function to allow more complex gizmos
* @method applyTransformMatrix
* @param {mat4} matrix transformation in matrix form
* @param {vec3} center ¿?
* @param {string} property_name "target" or "position"
* @return {mat4} mat4
*/
Light.prototype.applyTransformMatrix = function( matrix, center, property_name )
{
	if( this._root && this._root.transform )
		return false; //ignore transform

	var p = null;
	if (property_name == "target")
		p = this.target;
	else
		p = this.position;

	mat4.multiplyVec3( p, matrix, p );
	return true;
}

LS.registerComponent(Light);
LS.Light = Light;
//TODO

/**
* LightFX create volumetric and flare effects to the light
* @class LightFX
* @constructor
* @param {Object} object to configure from
*/

function LightFX(o)
{
	this.enabled = true;
	this.test_visibility = true;

	this.volume_visibility = 0;
	this.volume_radius = 1;
	this.volume_density = 1;

	this.glare_visibility = 1;
	this.glare_size = vec2.fromValues(0.2,0.2);
	this.glare_texture = null;

	//for caching purposes
	this._uniforms = {};

	if(o) 
		this.configure(o);
}

LightFX["@glare_texture"] = { type:"texture" };
LightFX["@glare_size"] = { type:"vec2", step: 0.001 };
LightFX["@glare_visibility"] = { type:"number", step: 0.001 };

LightFX.icon = "mini-icon-lightfx.png";

LightFX.prototype.onAddedToNode = function(node)
{
	LEvent.bind(node, "collectRenderInstances", this.onCollectInstances, this);
}

LightFX.prototype.onRemovedFromNode = function(node)
{
	LEvent.unbind(node, "collectRenderInstances", this.onCollectInstances, this);
}

LightFX.prototype.onCollectInstances = function(e,instances)
{
	if(!this.enabled) return;

	var light = this._root.light;
	if(light && !light.enabled)
		return;

	if(this.volume_visibility && light)
		instances.push( this.getVolumetricRenderInstance(light) );

	if(this.glare_visibility)
	{
		var ri = this.getGlareRenderInstance(light);
		if(ri)
			instances.push( ri );
	}
}

//not finished
LightFX.prototype.getVolumetricRenderInstance = function()
{
	//sphere
	if(!this._volumetric_mesh)
	{
		this._volumetric_mesh = GL.Mesh.sphere();
	}

	var RI = this._volumetric_render_instance;
	if(!RI)
		this._volumetric_render_instance = RI = new LS.RenderInstance(this._root, this);

	RI.flags = RenderInstance.ALPHA; //reset and set
	
	//material
	var mat = this._volumetric_material;
	if(!mat)
		mat = this._volumetric_material = new Material({shader_name:"volumetric_light", blending: Material.ADDITIVE_BLENDING });
	vec3.copy( mat.color, light.color );
	mat.opacity = this.volume_visibility;
	RI.material = mat;

	//do not need to update
	RI.matrix.set( this._root.transform._global_matrix );
	//mat4.identity( RI.matrix );
	//mat4.setTranslation( RI.matrix, this.getPosition() ); 

	mat4.multiplyVec3( RI.center, RI.matrix, light.position );
	mat4.scale( RI.matrix, RI.matrix, [this.volume_radius,this.volume_radius,this.volume_radius]);

	var volume_info = vec4.create();
	volume_info.set(RI.center);
	volume_info[3] = this.volume_radius * 0.5;
	RI.uniforms["u_volume_info"] = volume_info;
	RI.uniforms["u_volume_density"] = this.volume_density;
	
	RI.setMesh( this._mesh, gl.TRIANGLES );
	RI.flags = RI_CULL_FACE | RI_BLEND | RI_DEPTH_TEST;

	return RI;
}

LightFX.prototype.getGlareRenderInstance = function(light)
{
	if(!this.glare_texture)
		return null;

	var RI = this._glare_render_instance;
	if(!RI)
	{
		this._glare_render_instance = RI = new RenderInstance(this._root, this);
		RI.setMesh( GL.Mesh.plane({size:1}), gl.TRIANGLES );
		RI.priority = 1;
		RI.onPreRender = LightFX.onGlarePreRender;
	}
	
	//RI.flags = RI_2D_FLAGS;
	if(light)
		vec3.copy( RI.center, light.getPosition() );
	else
		vec3.copy( RI.center, this._root.transform.getGlobalPosition() );
	RI.pos2D = vec3.create();
	RI.scale_2D = this.glare_size;
	RI.test_visibility = this.test_visibility;

	//debug
	//RI.matrix.set( this._root.transform._global_matrix );

	var mat = this._glare_material;
	if(!mat)
		mat = this._glare_material = new Material({ blending: Material.ADDITIVE_BLENDING });
	if(light)
	{
		vec3.scale( mat.color, light.color, this.glare_visibility * light.intensity );
		mat.setTexture("color", this.glare_texture);
	}
	RI.setMaterial( mat );
	RI.flags |= RI_BLEND;
	
	return RI;
}

//render on RenderInstance
LightFX.onGlarePreRender = function( render_settings )
{
	if( LS.Renderer._current_pass != "color" )
		return; 

	//project point to 2D in normalized space
	mat4.projectVec3( this.pos2D, LS.Renderer._viewprojection_matrix, this.center );
	this.pos2D[0] = this.pos2D[0] * 2 - 1;
	this.pos2D[1] = this.pos2D[1] * 2 - 1;
	this.pos2D[2] = 0; //reset Z
	//this.material.opacity = 1 / (2*vec3.distance(this.pos2D, [0,0,0])); //attenuate by distance

	var center = this.center;
	var eye = LS.Renderer._current_camera.getEye();
	var scene = LS.Renderer._current_scene;
	var dir = vec3.sub(vec3.create(), eye, center );
	var dist = vec3.length(dir);
	vec3.scale(dir,dir,1/dist);


	var coll = 0;
	
	if(this.test_visibility)
		coll = LS.Picking.raycast( center, dir, { max_distance: dist } );

	if(coll.length)
	{
		this.material.opacity -= 0.05;
		if(this.material.opacity < 0.0)
			this.material.opacity = 0.0;
	}
	else
	{
		this.material.opacity += 0.05;
		if(this.material.opacity > 1.0)
			this.material.opacity = 1;
	}
}

LightFX.prototype.getResources = function (res)
{
	if(this.glare_texture)
		res[ this.glare_texture ] = Texture;
	return res;
}

LightFX.prototype.onResourceRenamed = function (old_name, new_name, resource)
{
	if(this.glare_texture == old_name)
		this.glare_texture = new_name;
}

//LS.registerComponent(LightFX);



/**
* Renders one mesh, it allows to configure the rendering primitive, the submesh (range of mesh) and a level of detail mesh
* @class MeshRenderer
* @namespace LS.Components
* @constructor
* @param {String} object to configure from
*/
function MeshRenderer(o)
{
	this.enabled = true;

	/**
	* The name of the mesh to render
	* @property mesh {string}
	* @default null;
	*/
	this.mesh = null;
	/**
	* The name of the mesh to render in case the mesh is far away, this mesh is also used for collision testing if using raycast to RenderInstances
	* @property lod_mesh {string}
	* @default null;
	*/
	this.lod_mesh = null;
	/**
	* The id of the submesh group to render, if the id is -1 then all the mesh is rendered.
	* @property submesh_id {number}
	* @default -1;
	*/
	this.submesh_id = -1;
	this.material = null;
	/**
	* The GL primitive to use when rendering this mesh (gl.POINTS, gl.TRIANGLES, etc), -1 is default, it also supports the option 10 which means Wireframe
	* @property primitive {number}
	* @default -1;
	*/
	this._primitive = -1;
	/**
	* If faces are two sided
	* @property two_sided {boolean}
	* @default -1;
	*/
	this.two_sided = false;
	/**
	* When rendering points the point size, if positive is in world space, if negative is in screen space
	* @property point_size {number}
	* @default -1;
	*/
	this.point_size = 0.1;
	/**
	* When rendering points tells if you want to use for every point the texture coordinates of the vertex or the point texture coordinates
	* @property textured_points {boolean}
	* @default false;
	*/
	this.textured_points = false;

	this.material = null;

	if(o)
		this.configure(o);

	if(!MeshRenderer._identity) //used to avoir garbage
		MeshRenderer._identity = mat4.create();

}

Object.defineProperty( MeshRenderer.prototype, 'primitive', {
	get: function() { return this._primitive; },
	set: function(v) { 
		v = (v === undefined || v === null ? -1 : v|0);
		if( v < -1 || v > 10 )
			return;
		this._primitive = v;
	},
	enumerable: true
});

MeshRenderer.icon = "mini-icon-teapot.png";

//vars
MeshRenderer["@mesh"] = { type: "mesh" };
MeshRenderer["@lod_mesh"] = { type: "mesh" };
MeshRenderer["@material"] = { type: "material" };
MeshRenderer["@primitive"] = { type:"enum", values: {"Default":-1, "Points": 0, "Lines":1, "LineLoop":2, "LineStrip":3, "Triangles":4, "TriangleStrip":5, "TriangleFan":6, "Wireframe":10 }};
MeshRenderer["@submesh_id"] = { type:"enum", values: function() {
	var component = this.instance;
	var mesh = component.getMesh();
	if(!mesh) return null;
	if(!mesh || !mesh.info || !mesh.info.groups || mesh.info.groups.length < 2)
		return null;

	var t = {"all":null};
	for(var i = 0; i < mesh.info.groups.length; ++i)
		t[mesh.info.groups[i].name] = i;
	return t;
}};

//we bind to onAddedToNode because the event is triggered per node so we know which RIs belong to which node
MeshRenderer.prototype.onAddedToNode = function(node)
{
	if(!node.meshrenderer)
		node.meshrenderer = this;
	LEvent.bind(node, "collectRenderInstances", this.onCollectInstances, this);
}

MeshRenderer.prototype.onRemovedFromNode = function(node)
{
	if(node.meshrenderer)
		delete node["meshrenderer"];
	LEvent.unbind(node, "collectRenderInstances", this.onCollectInstances, this);
}

/**
* Configure from a serialized object
* @method configure
* @param {Object} object with the serialized info
*/
MeshRenderer.prototype.configure = function(o)
{
	if(o.enabled !== undefined)
		this.enabled = o.enabled;
	this.mesh = o.mesh;
	this.lod_mesh = o.lod_mesh;
	this.submesh_id = o.submesh_id;
	this.primitive = o.primitive; //gl.TRIANGLES
	this.two_sided = !!o.two_sided;
	this.material = o.material;
	if(o.point_size !== undefined) //legacy
		this.point_size = o.point_size;
	this.textured_points = !!o.textured_points;
	if(o.material)
		this.material = typeof(o.material) == "string" ? o.material : new LS.Material(o.material);
}

/**
* Serialize the object 
* @method serialize
* @return {Object} object with the serialized info
*/
MeshRenderer.prototype.serialize = function()
{
	var o = { 
		enabled: this.enabled,
		mesh: this.mesh,
		lod_mesh: this.lod_mesh
	};

	if(this.material)
		o.material = typeof(this.material) == "string" ? this.material : this.material.serialize();

	if(this.primitive != -1)
		o.primitive = this.primitive;
	if(this.submesh_id)
		o.submesh_id = this.submesh_id;
	if(this.two_sided)
		o.two_sided = this.two_sided;
	o.point_size = this.point_size;
	o.textured_points = this.textured_points;
	o.material = this.material;
	return o;
}

MeshRenderer.prototype.getMesh = function() {
	if(!this.mesh)
		return null;

	if( this.mesh.constructor === String )
		return LS.ResourcesManager.meshes[this.mesh];
	return this.mesh;
}

MeshRenderer.prototype.getLODMesh = function() {
	if(!this.lod_mesh)
		return null;

	if( this.lod_mesh.constructor === String )
		return LS.ResourcesManager.meshes[ this.lod_mesh ];

	return null;
}

MeshRenderer.prototype.getAnyMesh = function() {
	return (this.getMesh() || this.getLODMesh());
}

MeshRenderer.prototype.getResources = function(res)
{
	if(typeof(this.mesh) == "string")
		res[this.mesh] = GL.Mesh;
	if(typeof(this.lod_mesh) == "string")
		res[this.lod_mesh] = GL.Mesh;
	return res;
}

MeshRenderer.prototype.onResourceRenamed = function (old_name, new_name, resource)
{
	if(this.mesh == old_name)
		this.mesh = new_name;
	if(this.lod_mesh == old_name)
		this.lod_mesh = new_name;
	if(this.morph_targets)
		for(var i in this.morph_targets)
			if( this.morph_targets[i].mesh == old_name )
				this.morph_targets[i].mesh = new_name;
}

//MeshRenderer.prototype.getRenderInstance = function(options)
MeshRenderer.prototype.onCollectInstances = function(e, instances)
{
	if(!this.enabled)
		return;

	var mesh = this.getAnyMesh();
	if(!mesh)
		return null;

	var node = this._root;
	if(!this._root)
		return;

	var RI = this._RI;
	if(!RI)
		this._RI = RI = new LS.RenderInstance( this._root, this );

	//matrix: do not need to update, already done
	RI.setMatrix( this._root.transform._global_matrix );
	//this._root.transform.getGlobalMatrix(RI.matrix);
	mat4.multiplyVec3( RI.center, RI.matrix, vec3.create() );

	//flags
	RI.flags = RI_DEFAULT_FLAGS | RI_RAYCAST_ENABLED;
	RI.applyNodeFlags();

	if(this.two_sided)
		RI.flags &= ~RI_CULL_FACE;

	//material (after flags because it modifies the flags)
	var material = null;
	if(this.material)
		material = LS.ResourcesManager.getResource( this.material );
	RI.setMaterial( material || this._root.getMaterial() );

	//if(!mesh.indexBuffers["wireframe"])
	//	mesh.computeWireframe();

	//buffers from mesh and bounding
	RI.setMesh( mesh, this.primitive );

	if(this.submesh_id != -1 && this.submesh_id != null && mesh.info && mesh.info.groups)
	{
		var group = mesh.info.groups[this.submesh_id];
		if(group)
			RI.setRange( group.start, group.length );
	}
	else
		RI.setRange(0,-1);


	//used for raycasting
	if(this.lod_mesh)
	{
		if( this.lod_mesh.constructor === String )
			RI.collision_mesh = LS.ResourcesManager.resources[ this.lod_mesh ];
		else
			RI.collision_mesh = this.lod_mesh;
		RI.setLODMesh( RI.collision_mesh );
	}
	else
		RI.collision_mesh = mesh;

	if(this.primitive == gl.POINTS)
	{
		RI.uniforms.u_point_size = this.point_size;
		RI.query.macros["USE_POINTS"] = "";
		if(this.textured_points)
			RI.query.macros["USE_TEXTURED_POINTS"] = "";
	}
	
	if(!this.textured_points && RI.query.macros["USE_TEXTURED_POINTS"])
		delete RI.query.macros["USE_TEXTURED_POINTS"];

	instances.push( RI );
}




LS.registerComponent( MeshRenderer );
LS.MeshRenderer = MeshRenderer;

function SkinnedMeshRenderer(o)
{
	this.enabled = true;
	this.apply_skinning = true;
	this.cpu_skinning = false;
	this.mesh = null;
	this.lod_mesh = null;
	this.submesh_id = -1;
	this.material = null;
	this._primitive = -1;
	this.point_size = 0.1;
	this.two_sided = false;
	this.ignore_transform = true;
	//this.factor = 1;

	//check how many floats can we put in a uniform
	if(!SkinnedMeshRenderer.num_supported_uniforms)
	{
		SkinnedMeshRenderer.num_supported_uniforms = gl.getParameter( gl.MAX_VERTEX_UNIFORM_VECTORS );
		SkinnedMeshRenderer.num_supported_textures = gl.getParameter( gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS );
		//check if GPU skinning is supported
		if( SkinnedMeshRenderer.num_supported_uniforms < SkinnedMeshRenderer.MAX_BONES*3 && SkinnedMeshRenderer.num_supported_textures == 0)
			SkinnedMeshRenderer.gpu_skinning_supported = false;
	}

	if(o)
		this.configure(o);

	if(!MeshRenderer._identity) //used to avoir garbage
		MeshRenderer._identity = mat4.create();
}

Object.defineProperty( SkinnedMeshRenderer.prototype, 'primitive', {
	get: function() { return this._primitive; },
	set: function(v) { 
		v = (v === undefined || v === null ? -1 : v|0);
		if(v != -1 && v != 0 && v!= 1 && v!= 4 && v!= 10)
			return;
		this._primitive = v;
	},
	enumerable: true
});

SkinnedMeshRenderer.MAX_BONES = 64;
SkinnedMeshRenderer.gpu_skinning_supported = true;
SkinnedMeshRenderer.icon = "mini-icon-stickman.png";

//vars
SkinnedMeshRenderer["@mesh"] = { widget: "mesh" };
SkinnedMeshRenderer["@lod_mesh"] = { widget: "mesh" };
SkinnedMeshRenderer["@primitive"] = {widget:"combo", values: {"Default":null, "Points": 0, "Lines":1, "Triangles":4, "Wireframe":10 }};
SkinnedMeshRenderer["@submesh_id"] = {widget:"combo", values: function() {
	var component = this.instance;
	var mesh = component.getMesh();
	if(!mesh) return null;
	if(!mesh || !mesh.info || !mesh.info.groups || mesh.info.groups.length < 2)
		return null;

	var t = {"all":null};
	for(var i = 0; i < mesh.info.groups.length; ++i)
		t[mesh.info.groups[i].name] = i;
	return t;
}};

SkinnedMeshRenderer.prototype.onAddedToNode = function(node)
{
	if(!node.meshrenderer)
		node.meshrenderer = this;
	LEvent.bind(node, "collectRenderInstances", this.onCollectInstances, this);
}

SkinnedMeshRenderer.prototype.onRemovedFromNode = function(node)
{
	if(node.meshrenderer)
		delete node["meshrenderer"];
	LEvent.unbind(node, "collectRenderInstances", this.onCollectInstances, this);
}

/**
* Configure from a serialized object
* @method configure
* @param {Object} object with the serialized info
*/
SkinnedMeshRenderer.prototype.configure = function(o)
{
	if(o.enabled != null)
		this.enabled = !!(o.enabled);
	this.cpu_skinning = !!(o.cpu_skinning);
	this.ignore_transform = !!(o.ignore_transform);

	this.mesh = o.mesh;
	this.lod_mesh = o.lod_mesh;
	this.submesh_id = o.submesh_id;
	this.primitive = o.primitive; //gl.TRIANGLES
	this.two_sided = !!o.two_sided;
	if(o.point_size !== undefined)
		this.point_size = o.point_size;
	if(o.material)
		this.material = typeof(o.material) == "string" ? o.material : new Material(o.material);
}

/**
* Serialize the object 
* @method serialize
* @return {Object} object with the serialized info
*/
SkinnedMeshRenderer.prototype.serialize = function()
{
	var o = { 
		enabled: this.enabled,
		apply_skinning: this.apply_skinning,
		cpu_skinning: this.cpu_skinning,
		ignore_transform: this.ignore_transform,
		mesh: this.mesh,
		lod_mesh: this.lod_mesh,
		primitive: this.primitive,
		submesh_id: this.submesh_id,
		two_sided: this.two_sided,
		point_size: this.point_size
	};

	if(this.material)
		o.material = typeof(this.material) == "string" ? this.material : this.material.serialize();

	return o;
}

SkinnedMeshRenderer.prototype.getMesh = function() {
	return LS.ResourcesManager.getMesh(this.mesh);
}

SkinnedMeshRenderer.prototype.getLODMesh = function() {
	return LS.ResourcesManager.getMesh(this.lod_mesh);
}

SkinnedMeshRenderer.prototype.getResources = function(res)
{
	if(typeof(this.mesh) == "string")
		res[this.mesh] = Mesh;
	if(typeof(this.lod_mesh) == "string")
		res[this.lod_mesh] = Mesh;
	return res;
}

SkinnedMeshRenderer.prototype.onResourceRenamed = function (old_name, new_name, resource)
{
	if(this.mesh == old_name)
		this.mesh = new_name;
	if(this.lod_mesh == old_name)
		this.lod_mesh = new_name;
}

SkinnedMeshRenderer.prototype.getNodeMatrix = function(name)
{
	var scene = this._root.scene;
	if(!scene)
		return null;

	var node = scene.getNode( name );
	if(!node)
		return null;
	node._is_bone = true;
	return node.transform.getGlobalMatrixRef();
}

//checks the list of bones in mesh.bones and retrieves its matrices
SkinnedMeshRenderer.prototype.getBoneMatrices = function(ref_mesh)
{
	//bone matrices
	var bones = this._last_bones;

	//reuse bone matrices
	if(!this._last_bones || this._last_bones.length != ref_mesh.bones.length )
	{
		bones = this._last_bones = [];
		for(var i = 0; i < ref_mesh.bones.length; ++i)
			bones[i] = mat4.create();
	}

	for(var i = 0; i < ref_mesh.bones.length; ++i)
	{
		var m = bones[i]; //mat4.create();
		var joint = ref_mesh.bones[i];
		var mat = this.getNodeMatrix( joint[0] ); //get the current matrix from the bone Node transform
		if(!mat)
		{
			mat4.identity( m );
		}
		else
		{
			var inv = joint[1];
			mat4.multiply( m, mat, inv );
			if(ref_mesh.bind_matrix)
				mat4.multiply( m, m, ref_mesh.bind_matrix);
		}

		//bones[i].push( m ); //multiply by the inv bindpose matrix
	}

	return bones;
}

SkinnedMeshRenderer.prototype.onCollectInstances = function(e, instances, options)
{
	if(!this.enabled)
		return;

	var mesh = this.getMesh();
	if(!mesh)
		return null;

	var node = this._root;
	if(!this._root)
		return;

	var RI = this._render_instance;
	if(!RI)
		this._render_instance = RI = new LS.RenderInstance(this._root, this);

	//this mesh doesnt have skinning info
	if(!mesh.getBuffer("vertices") || !mesh.getBuffer("bone_indices"))
		return;

	if(!this.apply_skinning)
	{
		RI.setMesh( mesh, this.primitive );
		//remove the flags to avoid recomputing shaders
		delete RI.query.macros["USE_SKINNING"]; 
		delete RI.query.macros["USE_SKINNING_TEXTURE"];
		delete RI.samplers["u_bones"];
	}
	else if( SkinnedMeshRenderer.gpu_skinning_supported && !this.cpu_skinning ) 
	{
		RI.setMesh(mesh, this.primitive);

		//add skinning
		RI.query.macros["USE_SKINNING"] = "";
		
		//retrieve all the bones
		var bones = this.getBoneMatrices(mesh);
		var bones_size = bones.length * 12;

		var u_bones = this._u_bones;
		if(!u_bones || u_bones.length != bones_size)
			this._u_bones = u_bones = new Float32Array( bones_size );

		//pack the bones in one single array (also skip the last row, is always 0,0,0,1)
		for(var i = 0; i < bones.length; i++)
		{
			mat4.transpose( bones[i], bones[i] );
			u_bones.set( bones[i].subarray(0,12), i * 12, (i+1) * 12 );
		}

		//can we pass the bones as a uniform?
		if( SkinnedMeshRenderer.num_supported_uniforms >= bones_size )
		{
			//upload the bones as uniform (faster but doesnt work in all GPUs)
			RI.uniforms["u_bones"] = u_bones;
			if(bones.length > SkinnedMeshRenderer.MAX_BONES)
				RI.query.macros["MAX_BONES"] = bones.length.toString();
			delete RI.samplers["u_bones"]; //use uniforms, not samplers
		}
		else if( SkinnedMeshRenderer.num_supported_textures > 0 ) //upload the bones as a float texture (slower)
		{
			var texture = this._bones_texture;
			if(!texture)
			{
				texture = this._bones_texture = new GL.Texture( 1, bones.length * 3, { format: gl.RGBA, type: gl.FLOAT, filter: gl.NEAREST} ); //3 rows of 4 values per matrix
				texture._data = new Float32Array( texture.width * texture.height * 4 );
			}

			texture._data.set( u_bones );
			texture.uploadData( texture._data, { no_flip: true } );
			LS.RM.textures[":bones"] = texture; //debug
			RI.query.macros["USE_SKINNING_TEXTURE"] = "";
			RI.samplers["u_bones"] = texture;
			delete RI.uniforms["u_bones"]; //use samplers, not uniforms
		}
		else
			console.error("impossible to get here")
	}
	else //cpu skinning (mega slow)
	{
		if(!this._skinned_mesh || this._skinned_mesh._reference != mesh)
		{
			this._skinned_mesh = new GL.Mesh();
			this._skinned_mesh._reference = mesh;
			var vertex_buffer = mesh.getBuffer("vertices");
			var normal_buffer = mesh.getBuffer("normals");

			//clone 
			for (var i in mesh.vertexBuffers)
				this._skinned_mesh.vertexBuffers[i] = mesh.vertexBuffers[i];
			for (var i in mesh.indexBuffers)
				this._skinned_mesh.indexBuffers[i] = mesh.indexBuffers[i];

			//new ones clonning old ones
			this._skinned_mesh.createVertexBuffer("vertices","a_vertex", 3, new Float32Array( vertex_buffer.data ), gl.STREAM_DRAW );
			if(normal_buffer)
				this._skinned_mesh.createVertexBuffer("normals","a_normal", 3, new Float32Array( normal_buffer.data ), gl.STREAM_DRAW );
		}


		//apply cpu skinning
		this.applySkin( mesh, this._skinned_mesh );
		RI.setMesh(this._skinned_mesh, this.primitive);
		//remove the flags to avoid recomputing shaders
		delete RI.query.macros["USE_SKINNING"]; 
		delete RI.query.macros["USE_SKINNING_TEXTURE"];
		delete RI.samplers["u_bones"];
	}

	//do not need to update
	//RI.matrix.set( this._root.transform._global_matrix );
	if( this.ignore_transform )
		mat4.identity( RI.matrix );
	else
		this._root.transform.getGlobalMatrix( RI.matrix );
	mat4.multiplyVec3( RI.center, RI.matrix, vec3.create() );

	if(this.submesh_id != -1 && this.submesh_id != null && mesh.info && mesh.info.groups)
	{
		var group = mesh.info.groups[this.submesh_id];
		if(group)
			RI.setRange( group.start, group.length );
	}
	else
		RI.setRange(0,-1);

	RI.material = this.material || this._root.getMaterial();

	RI.flags = RI_DEFAULT_FLAGS;
	RI.applyNodeFlags();
	if(this.two_sided)
		RI.flags &= ~RI_CULL_FACE;

	if( this.apply_skinning )
		RI.flags |= RI_IGNORE_FRUSTUM; //no frustum test in skinned meshes, hard to compute the frustrum in CPU

	if(this.primitive == gl.POINTS)
	{
		RI.uniforms.u_point_size = this.point_size;
		RI.query.macros["USE_POINTS"] = "";
	}

	instances.push(RI);
	//return RI;
}


SkinnedMeshRenderer.zero_matrix = new Float32Array(16);

SkinnedMeshRenderer.prototype.applySkin = function(ref_mesh, skin_mesh)
{
	var original_vertices = ref_mesh.getBuffer("vertices").data;
	var original_normals = null;
	if(ref_mesh.getBuffer("normals"))
		original_normals = ref_mesh.getBuffer("normals").data;

	var weights = ref_mesh.getBuffer("weights").data;
	var bone_indices = ref_mesh.getBuffer("bone_indices").data;

	var vertices_buffer = skin_mesh.getBuffer("vertices");
	var vertices = vertices_buffer.data;

	var normals_buffer = null;
	var normals = null;

	if(original_normals)
	{
		normals_buffer = skin_mesh.getBuffer("normals");
		normals = normals_buffer.data;
	}

	//bone matrices
	var bones = this.getBoneMatrices( ref_mesh );
	if(bones.length == 0) //no bones found
		return null;

	//var factor = this.factor; //for debug

	//apply skinning per vertex
	var temp = vec3.create();
	var ov_temp = vec3.create();
	var temp_matrix = mat4.create();
	for(var i = 0, l = vertices.length / 3; i < l; ++i)
	{
		var ov = original_vertices.subarray(i*3, i*3+3);

		var b = bone_indices.subarray(i*4, i*4+4);
		var w = weights.subarray(i*4, i*4+4);
		var v = vertices.subarray(i*3, i*3+3);

		var bmat = [ bones[ b[0] ], bones[ b[1] ], bones[ b[2] ], bones[ b[3] ] ];

		temp_matrix.set( SkinnedMeshRenderer.zero_matrix );
		mat4.scaleAndAdd( temp_matrix, temp_matrix, bmat[0], w[0] );
		if(w[1] > 0.0) mat4.scaleAndAdd( temp_matrix, temp_matrix, bmat[1], w[1] );
		if(w[2] > 0.0) mat4.scaleAndAdd( temp_matrix, temp_matrix, bmat[2], w[2] );
		if(w[3] > 0.0) mat4.scaleAndAdd( temp_matrix, temp_matrix, bmat[3], w[3] );

		mat4.multiplyVec3(v, temp_matrix, original_vertices.subarray(i*3, i*3+3) );
		if(normals)
		{
			var n = normals.subarray(i*3, i*3+3);
			mat4.rotateVec3(n, temp_matrix, original_normals.subarray(i*3, i*3+3) );
		}
		
		//we could also multiply the normal but this is already superslow...

		/* apply weights
		v[0] = v[1] = v[2] = 0.0; //reset
		mat4.multiplyVec3(v, bmat[0], ov_temp);
		vec3.scale(v,v,w[0]);
		for(var j = 1; j < 4; ++j)
			if(w[j] > 0.0)
			{
				mat4.multiplyVec3(temp, bmat[j], ov_temp);
				vec3.scaleAndAdd(v, v, temp, w[j]);
			}
		//*/

		//if(factor != 1) vec3.lerp( v, ov, v, factor);
	}

	//upload
	vertices_buffer.upload(gl.STREAM_DRAW);
	if(normals_buffer)
		normals_buffer.upload(gl.STREAM_DRAW);
}

SkinnedMeshRenderer.prototype.extractSkeleton = function()
{
	//TODO
}

LS.registerComponent(SkinnedMeshRenderer);
LS.SkinnedMeshRenderer = SkinnedMeshRenderer;
function MorphDeformer(o)
{
	this.enabled = true;
	this.morph_targets = [];

	if(MorphDeformer.max_supported_vertex_attribs === undefined)
		MorphDeformer.max_supported_vertex_attribs = gl.getParameter( gl.MAX_VERTEX_ATTRIBS );
	if(MorphDeformer.max_supported_morph_targets === undefined)
		MorphDeformer.max_supported_morph_targets = (gl.getParameter( gl.MAX_VERTEX_ATTRIBS ) - 6) / 2;

	if(o)
		this.configure(o);
}

MorphDeformer.icon = "mini-icon-teapot.png";
MorphDeformer.force_GPU  = true; //used to avoid to recompile the shader when all morphs are 0

MorphDeformer.prototype.onAddedToNode = function(node)
{
	LEvent.bind(node, "collectRenderInstances", this.onCollectInstances, this);
}

MorphDeformer.prototype.onRemovedFromNode = function(node)
{
	LEvent.unbind(node, "collectRenderInstances", this.onCollectInstances, this);
}

MorphDeformer.prototype.getResources = function(res)
{
	if(this.morph_targets.length)
		for(var i = 0; i < this.morph_targets.length; ++i)
			if( this.morph_targets[i].mesh )
				res[ this.morph_targets[i].mesh ] = GL.Mesh;
}

MorphDeformer.prototype.onResourceRenamed = function (old_name, new_name, resource)
{
	if(this.morph_targets.length)
		for(var i = 0; i < this.morph_targets.length; ++i)
			if( this.morph_targets[i].mesh == old_name )
				this.morph_targets[i].mesh = new_name;
}

MorphDeformer.prototype.onCollectInstances = function( e, render_instances )
{
	if(!render_instances.length || MorphDeformer.max_supported_vertex_attribs < 16)
		return;


	var morph_RI = this.enabled ? render_instances[ render_instances.length - 1] : null;
	
	if( morph_RI != this._last_RI && this._last_RI )
		this.disableMorphingGPU( this._last_RI );
	this._last_RI = morph_RI;

	if( !morph_RI || !morph_RI.mesh)
		return;

	this._valid_morphs = this.computeValidMorphs( this._valid_morphs );

	//grab the RI created previously and modified
	//this.applyMorphTargets( last_RI );

	if( this._morph_texture_supported === undefined )
		this._morph_texture_supported = (gl.extensions["OES_texture_float"] !== undefined && gl.getParameter( gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS ) > 1);

	if( this._valid_morphs.length == 0 && !MorphDeformer.force_GPU )
		return;

	if( this._valid_morphs.length <= 4 ) //use GPU
		this.applyMorphTargetsByGPU( morph_RI, this._valid_morphs );
//	else if( this._morph_texture_supported )
//		this.applyMorphUsingTextures( morph_RI, this._valid_morphs );
	else
		this.applyMorphBySoftware( morph_RI, this._valid_morphs );
}

//gather morph targets data
MorphDeformer.prototype.computeValidMorphs = function( valid_morphs )
{
	valid_morphs = valid_morphs || [];
	valid_morphs.length = 0;

	//sort by weight
	var morph_targets = this.morph_targets.concat();
	morph_targets.sort( function(a,b) { return Math.abs(b.weight) - Math.abs(a.weight);  } );

	//collect
	for(var i = 0; i < morph_targets.length; ++i)
	{
		var morph = morph_targets[i];
		if(!morph.mesh || Math.abs(morph.weight) < 0.001)
			continue;
		var morph_mesh = LS.ResourcesManager.resources[ morph.mesh ];
		if(!morph_mesh || morph_mesh.constructor !== GL.Mesh)
			continue;
		valid_morphs.push( { name: morph.mesh, weight: morph.weight, mesh: morph_mesh } );
	}

	return valid_morphs;
}

//add to the RI the info to apply the morphs using streams in the GPU
MorphDeformer.prototype.applyMorphTargetsByGPU = function( RI, valid_morphs )
{
	var base_mesh = RI.mesh;

	var base_vertices_buffer = base_mesh.vertexBuffers["vertices"];
	var streams_code = "";
	var morphs_buffers = {};
	var morphs_weights = [];

	//collect
	for(var i = 0; i < valid_morphs.length; ++i)
	{
		var morph = valid_morphs[i];
		var morph_mesh = morph.mesh;

		var vertices_buffer = morph_mesh.vertexBuffers["vertices"];
		if(!vertices_buffer || vertices_buffer.data.length != base_vertices_buffer.data.length)
			continue;

		var normals_buffer = morph_mesh.vertexBuffers["normals"];
		if(!normals_buffer)
			continue;

		var vertices_cloned = vertices_buffer.clone(true);
		var normals_cloned = normals_buffer.clone(true);
		vertices_cloned.attribute = null;
		normals_cloned.attribute = null;

		morphs_buffers["a_vertex_morph" + i ] = vertices_cloned;
		morphs_buffers["a_normal_morph" + i ] = normals_cloned;

		morphs_weights.push( morph.weight );
	}

	//add buffers
	RI.vertex_buffers = {};
	for(var i in base_mesh.vertexBuffers)
		RI.vertex_buffers[i] = base_mesh.vertexBuffers[i];
	for(var i in morphs_buffers)
		RI.vertex_buffers[i] = morphs_buffers[i];

	RI.query.macros["USE_MORPHING_STREAMS"] = "";

	var weights = new Float32Array( 4 );
	weights.set( morphs_weights );
	RI.uniforms["u_morph_weights"] = weights;
}

MorphDeformer.prototype.disableMorphingGPU = function( RI )
{
	if( RI.query && ( RI.query.macros["USE_MORPHING_STREAMS"] !== undefined || RI.query.macros["USE_MORPHING_TEXTURE"] !== undefined) )
	{
		delete RI.query.macros["USE_MORPHING_STREAMS"];
		delete RI.query.macros["USE_MORPHING_TEXTURE"];
		delete RI.uniforms["u_morph_weights"];
	}
}

MorphDeformer.prototype.applyMorphBySoftware = function( RI, valid_morphs )
{
	var base_mesh = RI.mesh;
	var base_vertices_buffer = base_mesh.vertexBuffers["vertices"];

	this.disableMorphingGPU( RI ); //disable GPU version

	var key = ""; //used to avoid computing the mesh every frame

	//collect
	for(var i = 0; i < valid_morphs.length; ++i)
	{
		var morph = valid_morphs[i];
		key += morph.name + "|" + morph.weight.toFixed(2) + "|";
	}

	//to avoid recomputing if nothing has changed
	if(key == this._last_key)
	{
		//change the RI
		if(this._final_vertices_buffer)
			RI.vertex_buffers["vertices"] = this._final_vertices_buffer;
		if(this._final_normals_buffer)
			RI.vertex_buffers["normals"] = this._final_normals_buffer;
		return; 
	}
	this._last_key = key;

	var base_vertices_buffer = base_mesh.vertexBuffers["vertices"];
	var base_vertices = base_vertices_buffer.data;
	var base_normals_buffer = base_mesh.vertexBuffers["normals"];
	var base_normals = base_normals_buffer.data;

	//create final buffers
	if(!this._final_vertices || this._final_vertices.length != base_vertices.length )
	{
		this._final_vertices = new Float32Array( base_vertices.length );
		this._final_vertices_buffer = new GL.Buffer( gl.ARRAY_BUFFER, this._final_vertices, 3, gl.STREAM_DRAW );
		this._final_vertices_buffer.attribute = "a_vertex";
	}

	if(!this._final_normals || this._final_normals.length != base_normals.length )
	{
		this._final_normals = new Float32Array( base_normals.length );
		this._final_normals_buffer = new GL.Buffer( gl.ARRAY_BUFFER, this._final_normals, 3, gl.STREAM_DRAW );
		this._final_normals_buffer.attribute = "a_normal";
	}

	var vertices = this._final_vertices;
	var normals = this._final_normals;

	vertices.set( base_vertices );
	normals.set( base_normals );

	var morphs_vertices = [];
	var morphs_normals = [];
	var morphs_weights = [];
	var num_morphs = valid_morphs.length;

	for(var i = 0; i < valid_morphs.length; ++i)
	{
		var morph = valid_morphs[i];
		morphs_vertices.push( morph.mesh.vertexBuffers["vertices"].data );
		morphs_normals.push( morph.mesh.vertexBuffers["normals"].data );
		morphs_weights.push( morph.weight );
	}

	//fill them 
	for(var i = 0, l = vertices.length; i < l; i += 3)
	{
		var v = vertices.subarray(i,i+3);
		var n = normals.subarray(i,i+3);

		for(var j = 0; j < num_morphs; ++j)
		{
			var m_v = morphs_vertices[j];
			var m_n = morphs_normals[j];
			var w = morphs_weights[j];
			v[0] += (m_v[i] - base_vertices[i]) * w;
			v[1] += (m_v[i+1] - base_vertices[i+1]) * w;
			v[2] += (m_v[i+2] - base_vertices[i+2]) * w;
			n[0] += (m_n[i] - base_normals[i]) * w;
			n[1] += (m_n[i+1] - base_normals[i+1]) * w;
			n[2] += (m_n[i+2] - base_normals[i+2]) * w;
		}
	}

	this._final_vertices_buffer.upload(  gl.STREAM_DRAW );
	this._final_normals_buffer.upload(  gl.STREAM_DRAW );

	//change the RI
	RI.vertex_buffers["vertices"] = this._final_vertices_buffer;
	RI.vertex_buffers["normals"] = this._final_normals_buffer;
}


MorphDeformer.prototype.applyMorphUsingTextures = function( RI, valid_morphs )
{
	var base_mesh = RI.mesh;
	var base_vertices_buffer = base_mesh.vertexBuffers["vertices"];
	var base_normals_buffer = base_mesh.vertexBuffers["vertices"];

	//create textures for the base mesh
	if(!base_vertices_buffer._texture)
		base_vertices_buffer._texture = this.createGeometryTexture( base_vertices_buffer );
	if(!base_normals_buffer._texture)
		base_normals_buffer._texture = this.createGeometryTexture( base_normals_buffer );

	var morphs_textures = [];

	//create the texture container
	if(!this._morphtarget_vertices_texture || this._morphtarget_vertices_texture.height != base_vertices_buffer._texture.height )
	{
		this._morphtarget_vertices_texture = new GL.Texture( base_vertices_buffer._texture.width, base_vertices_buffer._texture.height, { format: gl.RGB, type: gl.FLOAT, filter: gl.NEAREST, wrap: gl.CLAMP_TO_EDGE, no_flip: true });
		this._texture_size = vec4.fromValues( this._morphtarget_vertices_texture.width, this._morphtarget_vertices_texture.height, 
			1 / this._morphtarget_vertices_texture.width, 1 / this._morphtarget_vertices_texture.height );
	}
	if(!this._morphtarget_normals_texture)
		this._morphtarget_normals_texture = new GL.Texture( base_normals_buffer._texture.width, base_normals_buffer._texture.height, { format: gl.RGB, type: gl.FLOAT, filter: gl.NEAREST, wrap: gl.CLAMP_TO_EDGE, no_flip: true });

	for(var i = 0; i < valid_morphs.length; ++i)
	{
		var morph = valid_morphs[i];
		var morph_mesh = morph.mesh;

		var vertices_buffer = morph_mesh.vertexBuffers["vertices"];
		if(!vertices_buffer || vertices_buffer.data.length != base_vertices_buffer.data.length)
			continue;

		var normals_buffer = morph_mesh.vertexBuffers["normals"];
		if(!normals_buffer)
			continue;

		//create texture
		if(!vertices_buffer._texture)
			vertices_buffer._texture = this.createGeometryTexture( vertices_buffer );
		if(!normals_buffer._texture)
			normals_buffer._texture = this.createGeometryTexture( normals_buffer );

		morphs_textures.push( { weight: morph.weight, vertices: vertices_buffer._texture, normals: normals_buffer._texture } );
	}

	//blend all morphs targets in one texture

	var shader = this.getMorphTextureShader();
	shader.uniforms({ u_base_texture: 0, u_morph_texture: 1 });

	gl.enable( gl.BLEND );
	gl.blendFunc( gl.ONE, gl.ONE );

	base_vertices_buffer._texture.bind(0);
	var quad_mesh = GL.Mesh.getScreenQuad();

	this._morphtarget_vertices_texture.drawTo( function(){
		for(var i = 0; i < morphs_textures.length; ++i )
		{
			morphs_textures[i].vertices.bind(1);
			shader.uniforms({ u_weight: morphs_textures[i].weight });
			shader.draw( quad_mesh, gl.TRIANGLES );
		}
	});

	base_normals_buffer._texture.bind(0);

	this._morphtarget_normals_texture.drawTo( function(){
		for(var i = 0; i < morphs_textures.length; ++i )
		{
			morphs_textures[i].normals.bind(1);
			shader.uniforms({ u_weight: morphs_textures[i].weight });
			shader.draw( quad_mesh, gl.TRIANGLES );
		}
	});


	gl.disable( gl.BLEND );

	//create sequence numbers buffer of the same size
	var num_verts = base_vertices_buffer.data.length / 3;
	if(!this._ids_buffer || this._ids_buffer.data.length != num_verts )
	{
		var ids_data = new Float32Array( num_verts );
		for(var i = 0; i < num_verts; ++i)
			ids_data[i] = i;
		this._ids_buffer = new GL.Buffer( gl.ARRAY_BUFFER, ids_data, 1, gl.STATIC_DRAW );
		this._ids_buffer.attribute = "a_morphing_ids";
	}

	//modify the RI to have the displacement texture
	RI.samplers["u_morph_vertexs_texture"] = this._morphtarget_vertices_texture;
	RI.samplers["u_morph_normals_texture"] = this._morphtarget_normals_texture;
	RI.uniforms["u_morph_texture_size"] = this._texture_size;

	//add the ids
	RI.vertex_buffers["a_morphing_ids"] = this._ids_buffer;

	//enable the algorithm
	RI.query.macros["USE_MORPHING_TEXTURE"] = "";
}


MorphDeformer._blend_shader_fragment_code = "\n\
	precision highp float;\n\
	uniform sampler2D u_base_texture;\n\
	uniform sampler2D u_morph_texture;\n\
	uniform float u_weight;\n\
	varying vec2 v_coord;\n\
	void main() {\n\
		gl_FragColor = u_weight * (texture2D(u_morph_texture, v_coord) - texture2D(u_base_texture, v_coord));\n\
	}\n\
";

MorphDeformer.prototype.getMorphTextureShader  = function()
{
	if(!this._blend_shader)
		this._blend_shader = new GL.Shader( Shader.SCREEN_VERTEX_SHADER, MorphDeformer._blend_shader_fragment_code );
	return this._blend_shader;
}

MorphDeformer.prototype.createGeometryTexture = function( data_buffer )
{
	var data = data_buffer.data;
	var buffer = data.buffer;

	var size = buffer.byteLength;
	var max_texture_size = gl.getParameter( gl.MAX_TEXTURE_SIZE );

	var width = max_texture_size;
	var height = Math.round( size / width );
	
	var texture = new GL.Texture( width, height, { format: gl.RGB, type: gl.FLOAT, filter: gl.NEAREST, wrap: gl.CLAMP_TO_EDGE, pixel_data: buffer, no_flip: true });
	return texture;
}




MorphDeformer.prototype.setMorphMesh = function(index, value)
{
	if(index >= this.morph_targets.length)
		return;
	this.morph_targets[index].mesh = value;
}

MorphDeformer.prototype.setMorphWeight = function(index, value)
{
	if(index >= this.morph_targets.length)
		return;
	this.morph_targets[index].weight = value;
}

MorphDeformer.prototype.getPropertyInfoFromPath = function( path )
{
	if(path[0] != "morphs")
		return;

	if(path.length == 1)
		return {
			node: this._root,
			target: this.morph_targets,
			type: "object"
		};

	var num = parseInt( path[1] );
	if(num >= this.morph_targets.length)
		return;

	var varname = path[2];
	if(varname != "mesh" && varname != "weight")
		return;

	return {
		node: this._root,
		target: this.morph_targets,
		name: varname,
		value: this.morph_targets[num][ varname ] !== undefined ? this.morph_targets[num][ varname ] : null,
		type: varname == "mesh" ? "mesh" : "number"
	};
}

MorphDeformer.prototype.setPropertyValueFromPath = function( path, value, offset )
{
	offset = offset || 0;

	if( path.length < (offset+1) )
		return;

	if( path[offset] != "morphs" )
		return;

	var num = parseInt( path[offset+1] );
	if(num >= this.morph_targets.length)
		return;

	var varname = path[offset+2];
	this.morph_targets[num][ varname ] = value;
}

//used for graphs
MorphDeformer.prototype.setProperty = function(name, value)
{
	if( name == "enabled" )
		this.enabled = value;
	else if( name.substr(0,5) == "morph" )
	{
		name = name.substr(5);
		var t = name.split("_");
		var num = parseInt( t[0] );
		if( num < this.morph_targets.length )
		{
			if( t[1] == "weight" )
				this.morph_targets[ num ].weight = value;
			else if( t[1] == "mesh" )
				this.morph_targets[ num ].mesh = value;
		}
	}
}


MorphDeformer.prototype.getProperties = function()
{
	var properties = {
		enabled: "boolean"
	};

	for(var i = 0; i < this.morph_targets.length; i++)
	{
		properties[ "morph" + i + "_weight" ] = "number";
		properties[ "morph" + i + "_mesh" ] = "Mesh";
	}

	return properties;
}


LS.registerComponent( MorphDeformer );
LS.MorphDeformer = MorphDeformer;

/**
* It applyes skinning to a RenderInstance created by another component (usually MeshRenderer)
* Is in charge of gathering the bone nodes and adding to the RenderInstance the information needed to perform the skinning
* It can do it using shader uniforms (simple way), a matrices texture (complex way), or by directly applying skinning by software (slow but well supported way)
* It also allow to limit the bone search to specific nodes.
*
* @class SkinDeformer
* @constructor
*/
function SkinDeformer(o)
{
	this.enabled = true;
	this.search_bones_in_parent = false;
	this.skeleton_root_node = null;
	this.cpu_skinning = false;
	this.ignore_transform = true;

	this._mesh = null;

	//check how many floats can we put in a uniform
	if(!SkinDeformer.num_supported_uniforms)
	{
		SkinDeformer.num_supported_uniforms = gl.getParameter( gl.MAX_VERTEX_UNIFORM_VECTORS );
		SkinDeformer.num_supported_textures = gl.getParameter( gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS );
		//check if GPU skinning is supported
		if( SkinDeformer.num_supported_uniforms < SkinDeformer.MAX_BONES*3 && SkinDeformer.num_supported_textures == 0)
			SkinDeformer.gpu_skinning_supported = false;
	}

	if(o)
		this.configure(o);

	if(!MeshRenderer._identity) //used to avoir garbage
		MeshRenderer._identity = mat4.create();
}

SkinDeformer.icon = "mini-icon-stickman.png";

SkinDeformer.MAX_BONES = 64;
SkinDeformer.gpu_skinning_supported = true;
SkinDeformer.icon = "mini-icon-stickman.png";

SkinDeformer["@skeleton_root_node"] = { type: "node" };

SkinDeformer.prototype.onAddedToNode = function(node)
{
	LEvent.bind(node, "collectRenderInstances", this.onCollectInstances, this);
}

SkinDeformer.prototype.onRemovedFromNode = function(node)
{
	LEvent.unbind(node, "collectRenderInstances", this.onCollectInstances, this);
}

//returns the bone node taking into account the scoping of the component
SkinDeformer.prototype.getBoneNode = function( name )
{
	var root_node = this._root;
	var scene = root_node.scene;
	if(!scene)
		return null;

	var node = null;

	if( this.skeleton_root_node )
	{
		root_node = scene.getNode( this.skeleton_root_node );
		if(root_node)
			return root_node.findNodeByName( name );
	}
	else if(this.search_bones_in_parent)
	{
		return root_node.parentNode.findNode( name );
	}
	else
		return scene.getNode( name );
	return null;
}

//returns a reference to the global matrix of the bone
SkinDeformer.prototype.getBoneMatrix = function( name )
{
	var node = this.getBoneNode( name );
	if(!node)
		return null;
	node._is_bone = true;
	return node.transform.getGlobalMatrixRef();
}

//checks the list of bones in mesh.bones and retrieves its matrices
SkinDeformer.prototype.getBoneMatrices = function( ref_mesh )
{
	//bone matrices
	var bones = this._last_bones;

	//reuse bone matrices
	if(!this._last_bones || this._last_bones.length != ref_mesh.bones.length )
	{
		bones = this._last_bones = [];
		for(var i = 0; i < ref_mesh.bones.length; ++i)
			bones[i] = mat4.create();
	}

	for(var i = 0; i < ref_mesh.bones.length; ++i)
	{
		var m = bones[i]; //mat4.create();
		var joint = ref_mesh.bones[i];
		var mat = this.getBoneMatrix( joint[0] ); //get the current matrix from the bone Node transform
		if(!mat)
		{
			mat4.identity( m );
		}
		else
		{
			var inv = joint[1];
			mat4.multiply( m, mat, inv );
			if(ref_mesh.bind_matrix)
				mat4.multiply( m, m, ref_mesh.bind_matrix);
		}

		//bones[i].push( m ); //multiply by the inv bindpose matrix
	}

	return bones;
}

//Adds the deforming data to the last RenderInstance
SkinDeformer.prototype.onCollectInstances = function( e, render_instances )
{
	if(!render_instances.length)
		return;

	var last_RI = render_instances[ render_instances.length - 1];
	
	if(!this.enabled)
	{
		//disable
		this.disableSkinning( last_RI );
		return;
	}

	//grab the RI created previously and modified
	this.applySkinning( last_RI );
}

//Applies skinning taking into account the options available (using uniforms, a texture or applying it by software)
SkinDeformer.prototype.applySkinning = function(RI)
{
	var mesh = RI.mesh;
	this._mesh = mesh;

	//this mesh doesnt have skinning info
	if(!mesh.getBuffer("vertices") || !mesh.getBuffer("bone_indices"))
		return;

	else if( SkinDeformer.gpu_skinning_supported && !this.cpu_skinning ) 
	{
		//add skinning
		RI.query.macros["USE_SKINNING"] = "";
		
		//retrieve all the bones
		var bones = this.getBoneMatrices( mesh );
		var bones_size = bones.length * 12;

		var u_bones = this._u_bones;
		if(!u_bones || u_bones.length != bones_size)
			this._u_bones = u_bones = new Float32Array( bones_size );

		//pack the bones in one single array (also skip the last row, is always 0,0,0,1)
		for(var i = 0; i < bones.length; i++)
		{
			mat4.transpose( bones[i], bones[i] );
			u_bones.set( bones[i].subarray(0,12), i * 12, (i+1) * 12 );
		}

		//can we pass the bones as a uniform?
		if( SkinDeformer.num_supported_uniforms >= bones_size )
		{
			//upload the bones as uniform (faster but doesnt work in all GPUs)
			RI.uniforms["u_bones"] = u_bones;
			if(bones.length > SkinDeformer.MAX_BONES)
				RI.query.macros["MAX_BONES"] = bones.length.toString();
			delete RI.samplers["u_bones"]; //use uniforms, not samplers
		}
		else if( SkinDeformer.num_supported_textures > 0 ) //upload the bones as a float texture (slower)
		{
			var texture = this._bones_texture;
			if(!texture)
			{
				texture = this._bones_texture = new GL.Texture( 1, bones.length * 3, { format: gl.RGBA, type: gl.FLOAT, filter: gl.NEAREST} ); //3 rows of 4 values per matrix
				texture._data = new Float32Array( texture.width * texture.height * 4 );
			}

			texture._data.set( u_bones );
			texture.uploadData( texture._data, { no_flip: true } );
			LS.RM.textures[":bones"] = texture; //debug
			RI.query.macros["USE_SKINNING_TEXTURE"] = "";
			RI.samplers["u_bones"] = texture;
			delete RI.uniforms["u_bones"]; //use samplers, not uniforms
		}
		else
			console.error("impossible to get here");
	}
	else //cpu skinning (mega slow)
	{
		if(!this._skinned_mesh || this._skinned_mesh._reference != mesh)
		{
			this._skinned_mesh = new GL.Mesh();
			this._skinned_mesh._reference = mesh;
			var vertex_buffer = mesh.getBuffer("vertices");
			var normal_buffer = mesh.getBuffer("normals");

			//clone 
			for (var i in mesh.vertexBuffers)
				this._skinned_mesh.vertexBuffers[i] = mesh.vertexBuffers[i];
			for (var i in mesh.indexBuffers)
				this._skinned_mesh.indexBuffers[i] = mesh.indexBuffers[i];

			//new ones clonning old ones
			this._skinned_mesh.createVertexBuffer("vertices","a_vertex", 3, new Float32Array( vertex_buffer.data ), gl.STREAM_DRAW );
			if(normal_buffer)
				this._skinned_mesh.createVertexBuffer("normals","a_normal", 3, new Float32Array( normal_buffer.data ), gl.STREAM_DRAW );
		}


		//apply cpu skinning
		this.applySoftwareSkinning( mesh, this._skinned_mesh );

		RI.setMesh( this._skinned_mesh, this.primitive );
		//remove the flags to avoid recomputing shaders
		delete RI.query.macros["USE_SKINNING"]; 
		delete RI.query.macros["USE_SKINNING_TEXTURE"];
		delete RI.samplers["u_bones"];
	}

	if( this.ignore_transform )
	{
		mat4.identity( RI.matrix );
		RI.normal_matrix.set( RI.matrix );
	}
	else
		this._root.transform.getGlobalMatrix( RI.matrix );
	mat4.multiplyVec3( RI.center, RI.matrix, vec3.create() );

	RI.flags |= RI_IGNORE_FRUSTUM; //no frustum test in skinned meshes, hard to compute the frustrum in CPU
}

SkinDeformer.prototype.disableSkinning = function( RI )
{
	this._mesh = null;

	if( RI.query.macros["USE_SKINNING"] !== undefined )
	{
		delete RI.query.macros["USE_SKINNING"]; 
		delete RI.query.macros["USE_SKINNING_TEXTURE"];
		delete RI.samplers["u_bones"];
	}
}

SkinDeformer.prototype.getMesh = function()
{
	return this._mesh;
}

//Takes every vertex and multiplyes it by its bone matrices (slow but it works everywhere)
SkinDeformer.prototype.applySoftwareSkinning = function(ref_mesh, skin_mesh)
{
	var original_vertices = ref_mesh.getBuffer("vertices").data;
	var original_normals = null;
	if(ref_mesh.getBuffer("normals"))
		original_normals = ref_mesh.getBuffer("normals").data;

	var weights = ref_mesh.getBuffer("weights").data;
	var bone_indices = ref_mesh.getBuffer("bone_indices").data;

	var vertices_buffer = skin_mesh.getBuffer("vertices");
	var vertices = vertices_buffer.data;

	var normals_buffer = null;
	var normals = null;

	if(!SkinDeformer.zero_matrix)
		SkinDeformer.zero_matrix = new Float32Array(16);
	var zero_matrix = SkinDeformer.zero_matrix;

	if(original_normals)
	{
		normals_buffer = skin_mesh.getBuffer("normals");
		normals = normals_buffer.data;
	}

	//bone matrices
	var bones = this.getBoneMatrices( ref_mesh );
	if(bones.length == 0) //no bones found
		return null;

	//var factor = this.factor; //for debug

	//apply skinning per vertex
	var temp = vec3.create();
	var ov_temp = vec3.create();
	var temp_matrix = mat4.create();
	for(var i = 0, l = vertices.length / 3; i < l; ++i)
	{
		var ov = original_vertices.subarray(i*3, i*3+3);

		var b = bone_indices.subarray(i*4, i*4+4);
		var w = weights.subarray(i*4, i*4+4);
		var v = vertices.subarray(i*3, i*3+3);

		var bmat = [ bones[ b[0] ], bones[ b[1] ], bones[ b[2] ], bones[ b[3] ] ];

		temp_matrix.set( zero_matrix );
		mat4.scaleAndAdd( temp_matrix, temp_matrix, bmat[0], w[0] );
		if(w[1] > 0.0) mat4.scaleAndAdd( temp_matrix, temp_matrix, bmat[1], w[1] );
		if(w[2] > 0.0) mat4.scaleAndAdd( temp_matrix, temp_matrix, bmat[2], w[2] );
		if(w[3] > 0.0) mat4.scaleAndAdd( temp_matrix, temp_matrix, bmat[3], w[3] );

		mat4.multiplyVec3(v, temp_matrix, original_vertices.subarray(i*3, i*3+3) );
		if(normals)
		{
			var n = normals.subarray(i*3, i*3+3);
			mat4.rotateVec3(n, temp_matrix, original_normals.subarray(i*3, i*3+3) );
		}
		
		//we could also multiply the normal but this is already superslow...
		if(0)
		{
			//apply weights
			v[0] = v[1] = v[2] = 0.0; //reset
			mat4.multiplyVec3(v, bmat[0], ov_temp);
			vec3.scale(v,v,w[0]);
			for(var j = 1; j < 4; ++j)
				if(w[j] > 0.0)
				{
					mat4.multiplyVec3( temp, bmat[j], ov_temp );
					vec3.scaleAndAdd( v, v, temp, w[j] );
				}
		}

		//if(factor != 1) vec3.lerp( v, ov, v, factor);
	}

	//upload
	vertices_buffer.upload(gl.STREAM_DRAW);
	if(normals_buffer)
		normals_buffer.upload(gl.STREAM_DRAW);
}

SkinDeformer.prototype.extractSkeleton = function()
{
	//TODO
}

//returns an array with all the bone nodes affecting this mesh
SkinDeformer.prototype.getBones = function()
{
	var mesh = this._mesh;
	if(!mesh && !mesh.bones)
		return null;

	var bones = [];
	for(var i in mesh.bones)
	{
		var bone = this.getBoneNode( mesh.bones[i][0] );
		if(bone)
			bones.push( bone );
	}

	return bones;
}

LS.registerComponent( SkinDeformer );
LS.SkinDeformer = SkinDeformer;

function Skybox(o)
{
	this.enabled = true;
	this.texture = null;
	this.intensity = 1;
	this.use_environment = true;
	if(o)
		this.configure(o);
}

Skybox.icon = "mini-icon-dome.png";

//vars
Skybox["@texture"] = { widget: "texture" };

Skybox.prototype.onAddedToNode = function(node)
{
	LEvent.bind(node, "collectRenderInstances", this.onCollectInstances, this);
}

Skybox.prototype.onRemovedFromNode = function(node)
{
	LEvent.unbind(node, "collectRenderInstances", this.onCollectInstances, this);
}

Skybox.prototype.getResources = function(res)
{
	if(typeof(this.texture) == "string")
		res[this.texture] = GL.Texture;
	return res;
}

Skybox.prototype.onResourceRenamed = function (old_name, new_name, resource)
{
	if(this.texture == old_name)
		this.texture = new_name;
}

Skybox.prototype.onCollectInstances = function(e, instances)
{
	if(!this._root || !this.enabled)
		return;

	var texture = null;
	if (this.use_environment)
		texture = LS.Renderer._current_scene.info.textures["environment"];
	else
		texture = this.texture;

	if(!texture)
		return;

	if(texture.constructor === String)
		texture = LS.ResourcesManager.textures[texture];

	if(!texture)
		return;

	var mesh = this._mesh;
	if(!mesh)
		mesh = this._mesh = GL.Mesh.cube({size: 10});

	var node = this._root;

	var RI = this._render_instance;
	if(!RI)
	{
		this._render_instance = RI = new LS.RenderInstance(this._root, this);
		RI.priority = 100;

		RI.onPreRender = function(render_settings) { 
			var cam_pos = LS.Renderer._current_camera.getEye();
			mat4.identity(this.matrix);
			mat4.setTranslation( this.matrix, cam_pos );
			if(this.node.transform)
			{
				var R = this.node.transform.getGlobalRotationMatrix();
				mat4.multiply( this.matrix, this.matrix, R );
			}

			//this.updateAABB(); this node doesnt have AABB (its always visible)
			vec3.copy( this.center, cam_pos );
		};
	}

	var mat = this._material;
	if(!mat)
		mat = this._material = new LS.Material({use_scene_ambient:false});

	vec3.copy( mat.color, [ this.intensity, this.intensity, this.intensity ] );
	var sampler = mat.setTexture( LS.Material.COLOR, texture );

	if(texture && texture.texture_type == gl.TEXTURE_2D)
	{
		sampler.uvs = "polar_vertex";
		texture.bind(0);
		texture.setParameter( gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE ); //to avoid going up
		texture.setParameter( gl.TEXTURE_MIN_FILTER, gl.LINEAR ); //avoid ugly error in atan2 edges
	}
	else
		sampler.uvs = "0";

	RI.setMesh(mesh);

	RI.flags = RI_DEFAULT_FLAGS;
	RI.applyNodeFlags();
	RI.enableFlag( RI_CW | RI_IGNORE_LIGHTS | RI_IGNORE_FRUSTUM | RI_IGNORE_CLIPPING_PLANE); 
	RI.disableFlag( RI_CAST_SHADOWS | RI_DEPTH_WRITE | RI_DEPTH_TEST ); 

	RI.setMaterial(mat);

	instances.push(RI);
}

LS.registerComponent(Skybox);
LS.Skybox = Skybox;

function BackgroundRenderer(o)
{
	this.enabled = true;
	this.texture = null;

	this.createProperty( "color", vec3.fromValues(1,1,1), "color" );
	this.opacity = 1.0;
	this.blend_mode = Blend.NORMAL;

	//this._color = vec3.fromValues(1,1,1);
	this.material_name = null;

	if(o)
		this.configure(o);
}

BackgroundRenderer.icon = "mini-icon-bg.png";
BackgroundRenderer["@texture"] = { type: "texture" };
BackgroundRenderer["@material_name"] = { type: "material" };
BackgroundRenderer["@blend_mode"] = { type: "enum", values: LS.Blend };
BackgroundRenderer["@opacity"] = { type: "number", step: 0.01 };

/*
Object.defineProperty( BackgroundRenderer.prototype, 'color', {
	get: function() { return this._color; },
	set: function(v) { this._color.set(v);},
	enumerable: true
});
*/

BackgroundRenderer.prototype.onAddedToNode = function(node)
{
	LEvent.bind(node, "collectRenderInstances", this.onCollectInstances, this);
}

BackgroundRenderer.prototype.onRemovedFromNode = function(node)
{
	LEvent.unbind(node, "collectRenderInstances", this.onCollectInstances, this);
}

BackgroundRenderer.prototype.getResources = function(res)
{
	if(typeof(this.texture) == "string")
		res[this.texture] = GL.Texture;
	return res;
}

BackgroundRenderer.prototype.onResourceRenamed = function (old_name, new_name, resource)
{
	if(this.texture == old_name)
		this.texture = new_name;
}

BackgroundRenderer.prototype.onCollectInstances = function(e, instances)
{
	if(!this.enabled)
		return;

	var mat = null;

	if( this.material_name )
		mat = LS.ResourcesManager.materials[ this.material_name ];

	if(!mat)
	{
		var texture = this.texture;
		if(!texture) 
			return;
		if(texture.constructor === String)
			texture = LS.ResourcesManager.textures[texture];

		if(!this._material)
			mat = this._material = new LS.Material({use_scene_ambient:false});
		else
			mat = this._material;

		mat.setTexture("color", texture);
		mat.color.set( this.color );
		mat.opacity = this.opacity;
		mat.blend_mode = this.blend_mode;
	}

	var mesh = this._mesh;
	if(!mesh)
		mesh = this._mesh = GL.Mesh.plane({size:2});

	var RI = this._render_instance;
	if(!RI)
	{
		this._render_instance = RI = new LS.RenderInstance(this._root, this);
		RI.priority = 100; //render the first one (is a background)
	}

	RI.setMesh( mesh );
	RI.setMaterial( mat );

	RI.flags = RI_DEFAULT_FLAGS;
	RI.applyNodeFlags();
	RI.disableFlag( RI_CAST_SHADOWS ); //never cast shadows
	RI.enableFlag( RI_IGNORE_LIGHTS ); //no lights
	RI.enableFlag( RI_CW );
	RI.disableFlag( RI_DEPTH_WRITE ); 
	RI.disableFlag( RI_DEPTH_TEST ); 
	RI.disableFlag( RI_CULL_FACE ); 
	RI.enableFlag( RI_IGNORE_FRUSTUM );
	RI.enableFlag( RI_IGNORE_VIEWPROJECTION );

	instances.push(RI);
}

LS.registerComponent( BackgroundRenderer );

function Collider(o)
{
	this.enabled = true;
	this.shape = 1;
	this.mesh = null;
	this.size = vec3.fromValues(0.5,0.5,0.5); //in local space?
	this.center = vec3.create(); //in local space?
	this.use_mesh_bounding = false;
	if(o)
		this.configure(o);
}

Collider.icon = "mini-icon-collider.png";

//vars
Collider["@size"] = { type: "vec3", step: 0.01 };
Collider["@center"] = { type: "vec3", step: 0.01 };
Collider["@mesh"] = { type: "mesh" };
Collider["@shape"] = { type:"enum", values: {"Box":1, "Sphere": 2, "Mesh":5 }};

//Collider["@adjustToNodeBounding"] = { type:"action" };

Collider.prototype.onAddedToScene = function(scene)
{
	LEvent.bind( scene, "collectPhysicInstances", this.onGetColliders, this);
}

Collider.prototype.onRemovedFromScene = function(scene)
{
	LEvent.unbind( scene, "collectPhysicInstances", this.onGetColliders, this);
}

Collider.prototype.getMesh = function() {
	if(typeof(this.mesh) === "string")
		return LS.ResourcesManager.meshes[this.mesh];
	return this.mesh;
}

Collider.prototype.getResources = function(res)
{
	if(!this.mesh) return;
	if(typeof(this.mesh) == "string")
		res[this.mesh] = Mesh;
	return res;
}

Collider.prototype.onResourceRenamed = function (old_name, new_name, resource)
{
	if(this.mesh == old_name)
		this.mesh = new_name;
}

/*
Collider.prototype.adjustToNodeBounding = function()
{
	var final_bounding = BBox.create();
	var components = this._root.getComponents();
	for(var i = 0: i < components.length; ++i)
	{
		var component = components[i];
		if(!component.getMesh)
			continue;
		var mesh = component.getMesh();
		if(!mesh)
			continue;
		var bounding = mesh.getBoundingBox();
		if(!bounding)
			return;
		//TODO: merge all the boundings
	}
}
*/

Collider.prototype.onGetColliders = function(e, colliders)
{
	if(!this.enabled)
		return;

	var PI = this._PI;
	if(!PI)
		this._PI = PI = new LS.PhysicsInstance(this._root, this);

	if(this._root.transform)
		PI.matrix.set( this._root.transform._global_matrix );

	PI.type = this.shape;
	PI.layers = this._root.layers;

	//get mesh
	var mesh = null;
	if(PI.type === LS.PhysicsInstance.MESH || this.use_mesh_bounding)
		mesh = this.getMesh();

	//spherical collider
	if(PI.type === LS.PhysicsInstance.SPHERE)
	{
		if(mesh)
			BBox.copy( PI.oobb, mesh.bounding );
		else
			BBox.setCenterHalfsize( PI.oobb, this.center, [this.size[0],this.size[0],this.size[0]]);
	}
	else if(PI.type === LS.PhysicsInstance.BOX)
	{
		if(mesh)
			BBox.copy( PI.oobb, mesh.bounding );
		else
			BBox.setCenterHalfsize( PI.oobb, this.center, this.size);
	}

	if(mesh)
		vec3.copy( PI.center, BBox.getCenter( mesh.bounding ) );
	else
		vec3.copy( PI.center, this.center );

	//convert center from local to world space
	vec3.transformMat4( PI.center, PI.center, PI.matrix );

	if(PI.type === LS.PhysicsInstance.MESH)
	{
		if(!mesh)
			return;
		PI.setMesh(mesh);
	}

	colliders.push(PI);
}


LS.registerComponent( Collider );
/** 
* This module allows to store custom data inside a node
* properties have the form of:
* - name:
* - value:
* - type:
* @class CustomData
* @constructor
* @param {Object} object to configure from
*/

function CustomData(o)
{
	this.properties = [];

	if(o)
		this.configure(o);
}


CustomData.icon = "mini-icon-bg.png";

CustomData.prototype.getResources = function(res)
{
	return res;
}

CustomData.prototype.addProperties = function( property )
{
	this.properties.push( property );
}

CustomData.prototype.getProperty = function( name )
{
	for(var i = 0; i < this.properties.length; i++)
		if(this.properties[i].name == name)
			return this.properties[i];
	return null;
}

CustomData.prototype.getProperties = function()
{
	return this.properties;
}

CustomData.prototype.updateProperty = function( p )
{
	//TODO
}

//used for animation tracks
CustomData.prototype.getPropertyInfoFromPath = function( path )
{
	var varname = path[0];
	var property = this.getProperty( varname );
	if(!property)
		return null;
	return {
		node: this._root,
		target: this,
		name: varname,
		value: property.value,
		type: property.type
	};
}

CustomData.prototype.setPropertyValueFromPath = function( path, value, offset )
{
	offset = offset || 0;

	var varname = path[offset];
	var property = this.getProperty( varname );
	if(!property)
		return;

	//assign
	if(property.value && property.value.set)
		property.value.set( value ); //typed arrays
	else
		property.value = value;
}


CustomData.prototype.onResourceRenamed = function (old_name, new_name, resource)
{
}

LS.registerComponent( CustomData );
LS.CustomData = CustomData;
var temp_vec3 = vec3.create();

function Sprite(o)
{
	this.enabled = true;
	this.texture = null;
	this.blend_mode = LS.Blend.ALPHA;

	this.size = vec2.fromValues(100,100);
	this.frame = null; //string
	this.flip_x = false;

	this._atlas = null; //uid
	this._atlas_component = null; //instance

	if(o)
		this.configure(o);
}

Sprite.icon = "mini-icon-teapot.png";

Sprite["@texture"] = { type:"texture" };
Sprite["@blend_mode"] = { type: "enum", values: LS.Blend };
Sprite["@atlas"] = { type: "component", filter: "SpriteAtlas" };

Object.defineProperty( Sprite.prototype, "atlas", {
	set: function(v){
		var compo = null;
		if(v && v.constructor === String) //find it by uid
		{
			this._atlas = v;
			compo = LS.GlobalScene.findComponentByUId( v );
			if(compo && compo.constructor != LS.Components.SpriteAtlas)
			{
				console.warn("Atlas must be of type SpriteAtlas");
				compo = null;
			}
		}
		else //instance
		{
			this._atlas = v ? v.uid : null;
			compo = v;
		}

		//attach to atlas
		if( this._atlas_component && this._atlas_component != compo )
			this._atlas_component.removeSprite( this );
		this._atlas_component = compo;
		if(this._atlas_component)
			this._atlas_component.addSprite( this );
	},
	get: function(){ 
		return this._atlas;
	},
	enumerable: true
});

//we bind to onAddedToNode because the event is triggered per node so we know which RIs belong to which node
Sprite.prototype.onAddedToNode = function( node )
{
	LEvent.bind( node, "collectRenderInstances", this.onCollectInstances, this);

	if( this._atlas_component )
		this._atlas_component.addSprite( this );
}

Sprite.prototype.onRemovedFromNode = function( node )
{
	LEvent.unbind( node, "collectRenderInstances", this.onCollectInstances, this);

	if( this._atlas_component )
		this._atlas_component.removeSprite( this );
}

Sprite.prototype.onAddedToScene = function( scene )
{
	if( this._atlas_component )
		this._atlas_component.addSprite( this );
}

Sprite.prototype.onRemovedFromScene = function( scene )
{
	if( this._atlas_component )
		this._atlas_component.removeSprite( this );
}

//MeshRenderer.prototype.getRenderInstance = function(options)
Sprite.prototype.onCollectInstances = function(e, instances)
{
	if( !this.enabled || this._atlas )
		return;

	var node = this._root;
	if(!this._root)
		return;

	//Mesh
	var mesh = LS.Components.Sprite._mesh;
	if(!mesh)
		mesh = LS.Components.Sprite._mesh = GL.Mesh.plane();

	//RI
	var RI = this._render_instance;
	if(!RI)
	{
		this._render_instance = RI = new LS.RenderInstance(this._root, this);
		RI.setMesh( mesh, gl.TRIANGLES );
	}

	//material
	if(!this._material)
		this._material = new LS.Material({ shader_name: "lowglobal" });
	this._material.setTexture( "COLOR", this.texture );
	this._material.blend_mode = this.blend_mode;
	RI.setMaterial( this._material ); //sets material and blend modes in render instance

	//Matrix do not need to update
	if( this._root.transform )
		RI.setMatrix( this._root.transform._global_matrix );
	mat4.getTranslation( RI.center, this._root.transform._global_matrix );

	//apply size and flip x 
	temp_vec3[0] = this.size[0] * (this.flip_x ? 1 : -1);
	temp_vec3[1] = this.size[1];
	temp_vec3[2] = 1;
	mat4.scale( RI.matrix, RI.matrix, temp_vec3 );

	//flags
	RI.flags = RI_DEFAULT_FLAGS;
	RI.applyNodeFlags();
	RI.flags &= ~RI_CULL_FACE; //two sided always
	if(this.blend_mode == LS.Blend.NORMAL)
		RI.disableFlag( RI_BLEND );
	else
		RI.enableFlag( RI_BLEND );
	instances.push(RI);
}

Sprite.prototype.getResources = function( res )
{
	if(typeof(this.texture) == "string")
		res[this.texture] = GL.Texture;
	return res;
}

LS.registerComponent( Sprite );
function SpriteAtlas( o )
{
	this.enabled = true;
	this.texture = null;
	this.areas = [];

	this._sprites = [];
	this._max_sprites = 256;

	if(o)
		this.configure(o);
}

SpriteAtlas.icon = "mini-icon-teapot.png";

SpriteAtlas["@texture"] = { type:"texture" };
SpriteAtlas["@areas"] = { type: "texture_areas" };

SpriteAtlas.plane_vertices = [vec3.fromValues(-0.5,0.5,0),vec3.fromValues(0.5,-0.5,0),vec3.fromValues(0.5,0.5,0),vec3.fromValues(-0.5,-0.5,0)];
SpriteAtlas.plane_normal = vec3.fromValues(0,0,1);

SpriteAtlas.prototype.onAddedToNode = function( node )
{
	LEvent.bind( node, "collectRenderInstances", this.onCollectInstances, this);
}

SpriteAtlas.prototype.onRemovedFromNode = function( node )
{
	LEvent.unbind( node, "collectRenderInstances", this.onCollectInstances, this);
}

SpriteAtlas.prototype.createMesh = function ()
{
	if( this._mesh_maxsprites == this._max_sprites )
		return;

	//buffers
	var vertices = new Float32Array( this._max_sprites * 4 * 3); //6 vertex per particle x 3 floats per vertex
	var normals = new Float32Array( this._max_sprites * 4 * 3); //6 vertex per particle x 3 floats per vertex
	var coords = new Float32Array( this._max_sprites * 4 * 2);
	var colors = new Float32Array( this._max_sprites * 4 * 4);
	var indices = new Uint16Array( this._max_sprites * 6);

	//this._default_vertices = new Float32Array([-0.5,0.5,0 , -0.5,-0.5,0, 0.5,0.5,0, 0.5,-0.5,0 ]);
	//var default_indices = [0,1,2,0,3,1];
	var default_coords = new Float32Array([0,0, 1,1, 1,0, 0,1 ]);
	var default_color = new Float32Array([ 1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1 ]);

	//set to constant values
	for(var i = 0, l = this._max_sprites; i < l; ++i)
	{
		coords.set( default_coords , i*4*2);
		colors.set( default_color , i*4*4);

		indices[i*6] = i*4;
		indices[i*6+1] = i*4+1;
		indices[i*6+2] = i*4+2;
		indices[i*6+3] = i*4;
		indices[i*6+4] = i*4+3;
		indices[i*6+5] = i*4+1;
	}

	this._mesh = new GL.Mesh();
	this._mesh.addBuffers({ vertices: vertices, normals: normals, coords: coords, colors: colors }, {triangles: indices}, gl.STREAM_DRAW);
	this._mesh_maxsprites = this._max_sprites;
}

SpriteAtlas.prototype.updateMesh = function()
{
	if(!this._mesh)
		this.createMesh();

	var mesh = this._mesh;
	var vertices_array = SpriteAtlas.plane_vertices;
	var N =  SpriteAtlas.plane_normal;

	var vertices_buffer = mesh.getBuffer("vertices");
	var normals_buffer = mesh.getBuffer("normals");
	var vertices = vertices_buffer.data;
	var normals = normals_buffer.data;

	var pos = 0;

	for(var i = 0, l = Math.min(this._sprites.length, this._max_sprites); i < l; ++i)
	{
		var sprite = this._sprites[i];
		if(!sprite.enabled)
			continue;

		//collect positions for every sprite
		var matrix = null;
		if(sprite.matrix)
			matrix = sprite.matrix;
		else if( sprite._root && sprite._root.transform)
			matrix = sprite._root.transform._global_matrix;
		else
			continue;

		mat4.rotateVec3( temp_vec3, matrix, N );

		for(var j = 0; j < 4; ++j)
		{
			var v_index = pos*4*3 + j*3;
			vec3.transformMat4( vertices.subarray(v_index, v_index + 3), vertices_array[j], matrix );
			normals.set( temp_vec3, v_index );
		}

		pos += 1;
	}

	if(pos)
	{
		//TODO: upload range only
		vertices_buffer.upload();
		normals_buffer.upload();
	}

	this._last_index = pos * 6;
}

//MeshRenderer.prototype.getRenderInstance = function(options)
SpriteAtlas.prototype.onCollectInstances = function(e, instances)
{
	if(!this.enabled)
		return;

	var node = this._root;
	if(!this._root)
		return;

	if(!this._sprites.length)
		return;

	//Mesh
	this.updateMesh();
	var mesh = this._mesh;

	if(!this._last_index)
		return;


	//RI
	var RI = this._render_instance;
	if(!RI)
	{
		this._render_instance = RI = new LS.RenderInstance(this._root, this);
		RI.setMesh( mesh, gl.TRIANGLES );
	}

	//material
	if(!this._material)
		this._material = new LS.Material({ shader_name: "lowglobal" });
	this._material.setTexture( "COLOR", this.texture );
	RI.setMaterial( this._material ); //sets material and blend modes in render instance

	//flags
	RI.flags = RI_DEFAULT_FLAGS | RI_IGNORE_FRUSTUM;
	RI.applyNodeFlags();
	RI.flags &= ~RI_CULL_FACE; //two sided always

	RI.setRange(0, this._last_index);

	/*
	if(this.blend_mode == LS.Blend.NORMAL)
		RI.disableFlag( RI_BLEND );
	else
		RI.enableFlag( RI_BLEND );
	*/

	//opaque RIs
	instances.push(RI);
}

//attach sprites to this atlas
SpriteAtlas.prototype.addSprite = function( sprite )
{
	var index = this._sprites.indexOf( sprite );
	if(index == -1)
		this._sprites.push( sprite );
}

SpriteAtlas.prototype.removeSprite = function( sprite )
{
	var index = this._sprites.indexOf( sprite );
	if(index != -1)
		this._sprites.splice( index, 1 );
}


SpriteAtlas.prototype.getResources = function( res )
{
	if(typeof(this.texture) == "string")
		res[this.texture] = GL.Texture;
	return res;
}

LS.registerComponent( SpriteAtlas );

SpriteAtlas.Area = function SpriteAtlasArea()
{
	this._start = vec2.create();
	this._size = vec2.create();
}
function AnnotationComponent(o)
{
	this.text = "";
	this.notes = [];
	this._screen_pos = vec3.create();
	this._selected = null;
	this.configure(o);
}

AnnotationComponent.editor_color = [0.33,0.874,0.56,0.9];


AnnotationComponent.onShowMainAnnotation = function (node)
{
	if(typeof(AnnotationModule) != "undefined")
		AnnotationModule.editAnnotation(node);
}

AnnotationComponent.onShowPointAnnotation = function (node, note)
{
	var comp = node.getComponent( AnnotationComponent );
	if(!comp) return;

	//in editor...
	if(typeof(AnnotationModule) != "undefined")
	{
		AnnotationModule.showDialog( note.text, { 
			item: note, 
			on_close: inner_update_note.bind(note), 
			on_delete: function(info) { 
				comp.removeAnnotation(info.item);
				LS.GlobalScene.refresh();
			},
			on_focus: function(info) { 
				AnnotationModule.focusInAnnotation(info.item);
				comp._selected = info.item;
			}});
	}


	function inner_update_note(text)
	{
		this.text = text;
	}
}

AnnotationComponent.prototype.addAnnotation = function(item)
{
	this._selected = null;
	this.notes.push(item);
}

AnnotationComponent.prototype.getAnnotation = function(index)
{
	return this.nodes[ index ];
}

AnnotationComponent.prototype.removeAnnotation = function(item)
{
	this._selected = null;
	var pos = this.notes.indexOf(item);
	if(pos != -1)
		this.notes.splice(pos,1);
}

AnnotationComponent.prototype.setStartTransform = function()
{
	this.start_position = this.getObjectCenter();
}

AnnotationComponent.prototype.getObjectCenter = function()
{
	var center = vec3.create();
	var mesh = this._root.getMesh();
	if(mesh && mesh.bounding )
		vec3.copy( center, BBox.getCenter(mesh.bounding) );
	var pos = this._root.transform.transformPointGlobal(center, vec3.create());
	return pos;
}

AnnotationComponent.prototype.serialize = function()
{
	var o = {
		text: this.text,
		notes: [],
		start_position: this.start_position
	};
	
	for(var i in this.notes)
	{
		var note = this.notes[i];
		for(var j in note)
		{
			if(note[j].constructor == Float32Array)
				Array.prototype.slice.call( note[j] );
		}
		o.notes.push(note);
	}
	return o;
}

AnnotationComponent.prototype.onAddedToNode = function(node)
{
	LEvent.bind(node,"mousedown",this.onMouse.bind(this),this);
}

AnnotationComponent.prototype.onRemovedFromNode = function(node)
{
}

AnnotationComponent.prototype.onMouse = function(type, e)
{
	if(e.eventType == "mousedown")
	{
		var node = this._root;
		this._screen_pos[2] = 0;
		var dist = vec3.dist( this._screen_pos, [e.canvasx, gl.canvas.height - e.canvasy, 0] );
		if(dist < 30)
		{
			var that = this;
			AnnotationComponent.onShowMainAnnotation(this._root);
		}

		for(var i in this.notes)
		{
			var note = this.notes[i];
			dist = vec2.dist( note._end_screen, [e.mousex, gl.canvas.height - e.mousey] );
			if(dist < 30)
			{
				this._selected = note;
				AnnotationComponent.onShowPointAnnotation(this._root, note);
				return true;
			}
		}
	}
}

AnnotationComponent.prototype.renderEditor = function( selected )
{
	if(!this.text && !this.notes.length)
		return;

	var center = vec3.create();
	var mesh = this._root.getMesh();
	if(mesh)
		vec3.copy( center, BBox.getCenter(mesh.bounding) );

	var camera = LS.Renderer._current_camera;

	var pos = this._root.transform.getGlobalPosition();
	var object_center = this.getObjectCenter();
	var camera_eye = camera.getEye();
	var right = camera.getLocalVector([1,0,0]);
	var top = 	camera.getLocalVector([0,1,0]);
	var front = camera.getLocalVector([0,0,1]);

	var f = Math.tan(camera.fov*DEG2RAD) * vec3.dist( pos, camera_eye );

	//why? to scale the icon?
	var icon_top = vec3.scale(vec3.create(), top, f * 0.2);
	var icon_right = vec3.scale(vec3.create(), right, f * 0.2);
	var icon_pos = vec3.add( vec3.create(), pos, icon_top );
	vec3.add( icon_pos, icon_right, icon_pos);

	camera.project( icon_pos, null, this._screen_pos );
	//var right = camera.getLocalVector([10,0,0]);
	//trace(this._screen_pos);

	gl.enable(gl.BLEND);
	gl.enable(gl.DEPTH_TEST);
	LS.Draw.setColor([1,1,1,1]);

	var lines = [];
	var lines_colors = [];
	var points = [];
	var points_colors = [];

	if(this.text)
	{
		lines.push(pos, icon_pos);
		lines_colors.push( [1,1,1,0],[1,1,1,1]);
		//Draw.setColor([0.33,0.874,0.56,1.0]);
		if( window.EditorModule )
			LS.Draw.renderImage( icon_pos, EditorModule.icons_path + "/mini-icon-script.png",f * 0.03);
	}

	var model = this._root.transform.getGlobalMatrix();

	//notes
	for(var i in this.notes)
	{
		var note = this.notes[i];
		var start = mat4.multiplyVec3( vec3.create(), model, note.start );
		var end = mat4.multiplyVec3( vec3.create(), model, note.end );
		note.end_world = end;

		points.push( end );
		lines.push( start, end );

		if(this._selected == note)
		{
			points_colors.push( [1,1,1,1] );
			lines_colors.push( [1,1,1,0.2],[1,1,0.8,1]);
		}
		else
		{
			points_colors.push( LS.Components.AnnotationComponent.editor_color );
			lines_colors.push( [0,0,0,0.2], LS.Components.AnnotationComponent.editor_color );
		}
		note._end_screen = camera.project( end );
	}

	//transform
	var start = this.start_position;
	if(start && vec3.dist(start, object_center) > 1)
	{
		//dashed line...
		var dist = vec3.dist(start, object_center);
		var line_dist = dist / 20.0;
		var delta = vec3.subtract(vec3.create(), object_center, start );
		vec3.normalize(delta, delta);
		for(var i = 0; i < 20; i += 2)
		{
			var temp = vec3.scale(vec3.create(), delta, i*line_dist );
			vec3.add(temp, temp, start);
			lines.push(temp);
			
			temp = vec3.scale(vec3.create(), delta,(i+1)*line_dist );
			vec3.add(temp, temp, start);
			lines.push(temp);
			lines_colors.push( [0,1,0,0.2],[0,1,0,1]);
		}
	}

	//render in two passes to have the cool semitransparent effect 
	LS.Draw.setPointSize( 12 );
	LS.Draw.renderPoints(points, points_colors);

	LS.Draw.setColor( [0,0,0,0.5] );
	LS.Draw.setPointSize( 10 );
	LS.Draw.renderPoints(points, points_colors);

	LS.Draw.setColor([1,1,1,1]);
	LS.Draw.renderLines(lines, lines_colors);

	gl.depthFunc( gl.GREATER );

	LS.Draw.setAlpha(0.1);
	LS.Draw.renderPoints(points, points_colors);
	LS.Draw.renderLines(lines, lines_colors);

	gl.depthFunc( gl.LESS );

	//texts
	gl.disable( gl.CULL_FACE );
	LS.Draw.setColor( LS.Components.AnnotationComponent.editor_color );
	for(var i in this.notes)
	{
		var note = this.notes[i];
		LS.Draw.push();
		//Draw.lookAt( note.end_world, camera_eye, [0,1,0] );
		LS.Draw.fromTranslationFrontTop(note.end_world, front, top );

		LS.Draw.translate( [-1,-1,0] );
		LS.Draw.scale( [-0.0004 * f,0.0004 * f,0.0004 * f] );
		var first_line = note.text.split("\n")[0];
		LS.Draw.renderText( first_line );
		//Draw.renderWireBox(10,10,10);
		LS.Draw.pop();
	}

	gl.disable(gl.BLEND);
}


LS.registerComponent( AnnotationComponent );
/**
* Rotator rotate a mesh over time
* @class Rotator
* @namespace LS.Components
* @constructor
* @param {String} object to configure from
*/

function Rotator(o)
{
	this.speed = 10;
	this.axis = [0,1,0];
	this.local_space = true;
	this.swing = false;
	this.swing_amplitude = 45;

	if(o)
		this.configure(o);
}

Rotator.icon = "mini-icon-rotator.png";

Rotator.prototype.onAddedToScene = function(scene)
{
	LEvent.bind(scene,"update",this.onUpdate,this);
}


Rotator.prototype.onRemovedFromScene = function(scene)
{
	LEvent.unbind(scene,"update",this.onUpdate,this);
}

Rotator.prototype.onUpdate = function(e,dt)
{
	if(!this._root) return;
	var scene = this._root.scene;

	if(!this._default)
		this._default = this._root.transform.getRotation();

	vec3.normalize(this.axis,this.axis);

	if(this.swing)
	{
		var R = quat.setAxisAngle(quat.create(), this.axis, Math.sin( this.speed * scene._global_time * 2 * Math.PI) * this.swing_amplitude * DEG2RAD );
		quat.multiply( this._root.transform._rotation, R, this._default);
		this._root.transform._dirty = true;
	}
	else
	{
		if(this.local_space)
			this._root.transform.rotate(this.speed * dt,this.axis);
		else
			this._root.transform.rotateGlobal(this.speed * dt,this.axis);
	}

	if(scene)
		scene.refresh();
}

LS.registerComponent( Rotator );
/**
* Camera controller
* @class CameraController
* @constructor
* @param {String} object to configure from
*/

function CameraController(o)
{
	this.enabled = true;

	this.speed = 10;
	this.rot_speed = 1;
	this.wheel_speed = 1;
	this.smooth = false;
	this.allow_panning = true;
	this.mode = CameraController.ORBIT;
	this.orbit_center = null;

	this._moving = vec3.fromValues(0,0,0);
	this._collision = vec3.create();

	this.configure(o);
}

CameraController.ORBIT = 1; //orbits around the center
CameraController.FIRSTPERSON = 2; //moves relative to the camera
CameraController.PLANE = 3; //moves paralel to a plane

CameraController.icon = "mini-icon-cameracontroller.png";

CameraController["@mode"] = { type:"enum", values: { "Orbit": CameraController.ORBIT, "FirstPerson": CameraController.FIRSTPERSON, "Plane": CameraController.PLANE }};

CameraController.prototype.onAddedToScene = function( scene )
{
	LEvent.bind( scene, "mousedown",this.onMouse,this);
	LEvent.bind( scene, "mousemove",this.onMouse,this);
	LEvent.bind( scene, "mousewheel",this.onMouse,this);
	LEvent.bind( scene, "keydown",this.onKey,this);
	LEvent.bind( scene, "keyup",this.onKey,this);
	LEvent.bind( scene, "update",this.onUpdate,this);
}

CameraController.prototype.onRemovedFromScene = function( scene )
{
	LEvent.unbindAll( scene, this );
}

CameraController.prototype.onUpdate = function(e)
{
	if(!this._root || !this.enabled) 
		return;

	if(this._root.transform)
	{
	}
	else if(this._root.camera)
	{
		var cam = this._root.camera;
		if(this.mode == CameraController.FIRSTPERSON)
		{
			//move using the delta vector
			if(this._moving[0] != 0 || this._moving[1] != 0 || this._moving[2] != 0)
			{
				var delta = cam.getLocalVector( this._moving );
				vec3.scale(delta, delta, this.speed * (this._move_fast?10:1));
				cam.move(delta);
				cam.updateMatrices();
			}
		}
	}

	if(this.smooth)
	{
		this._root.scene.refresh();
	}
}

CameraController.prototype.onMouse = function(e, mouse_event)
{
	if(!this._root || !this.enabled) 
		return;
	
	var cam = this._root.camera;
	if(!cam) return;

	if(!mouse_event)
		mouse_event = e;

	if(mouse_event.eventType == "mousewheel")
	{
		var wheel = mouse_event.wheel > 0 ? 1 : -1;
		cam.orbitDistanceFactor(1 + wheel * -0.05 * this.wheel_speed, this.orbit_center);
		cam.updateMatrices();
		this._root.scene.refresh();
		return;
	}

	if(mouse_event.eventType == "mousedown")
	{
		if(this.mode == CameraController.PLANE)
			this.testOriginPlane( mouse_event.canvasx, gl.canvas.height - mouse_event.canvasy, this._collision );
		else
			this.testPerpendicularPlane( mouse_event.canvasx, gl.canvas.height - mouse_event.canvasy, cam.getCenter(), this._collision );
		this._button = mouse_event.button;
	}

	//regular mouse dragging
	if(!mouse_event.dragging)
		return;

	var changed = false;

	if( this._root.transform )
	{
		//TODO
	}
	else 
	{
		if(this.mode == CameraController.FIRSTPERSON)
		{
			cam.rotate(-mouse_event.deltax * this.rot_speed,[0,1,0]);
			cam.updateMatrices();
			var right = cam.getLocalVector([1,0,0]);
			cam.rotate(-mouse_event.deltay * this.rot_speed,right);
			cam.updateMatrices();
			changed = true;
		}
		else if(this.mode == CameraController.ORBIT)
		{
			if(this.allow_panning && (mouse_event.ctrlKey || mouse_event.button == 1)) //pan
			{
				var collision = vec3.create();
				this.testPerpendicularPlane( mouse_event.canvasx, gl.canvas.height - mouse_event.canvasy, cam.getCenter(), collision );
				var delta = vec3.sub( vec3.create(), this._collision, collision);
				cam.move( delta );
				//vec3.copy(  this._collision, collision );
				cam.updateMatrices();
				changed = true;
			}
			else //regular orbit
			{
				var yaw = mouse_event.deltax * this.rot_speed;
				var pitch = -mouse_event.deltay * this.rot_speed;

				if( Math.abs(yaw) > 0.0001 )
				{
					cam.orbit( -yaw, [0,1,0], this.orbit_center );
					cam.updateMatrices();
					changed = true;
				}

				var right = cam.getRight();
				var front = cam.getFront();
				var up = cam.getUp();
				var problem_angle = vec3.dot( up, front );
				if( !(problem_angle > 0.99 && pitch > 0 || problem_angle < -0.99 && pitch < 0)) //avoid strange behaviours
				{
					cam.orbit( -pitch, right, this.orbit_center );
					changed = true;
				}
			}
		}
		else if(this.mode == CameraController.PLANE)
		{
			if(this._button == 2)
			{
				cam.orbit( -mouse_event.deltax * this.rot_speed, [0,1,0], cam.target );
				changed = true;
			}
			else
			{
				var collision = vec3.create();
				this.testOriginPlane( mouse_event.canvasx, gl.canvas.height - mouse_event.canvasy, collision );
				var delta = vec3.sub( vec3.create(), this._collision, collision );
				cam.move( delta );
				cam.updateMatrices();
				changed = true;
			}
		}
	}

	if(changed)
		this._root.scene.refresh();
}

CameraController.prototype.testOriginPlane = function(x,y, result)
{
	var cam = this._root.camera;
	var ray = cam.getRayInPixel( x, gl.canvas.height - y );
	var result = result || vec3.create();

	//test against plane at 0,0,0
	if( geo.testRayPlane( ray.start, ray.direction, [0,0,0], [0,1,0], result ) )
		return true;
	return false;
}

CameraController.prototype.testPerpendicularPlane = function(x,y, center, result)
{
	var cam = this._root.camera;
	var ray = cam.getRayInPixel( x, gl.canvas.height - y );

	var front = cam.getFront();
	var center = center || cam.getCenter();
	var result = result || vec3.create();

	//test against plane
	if( geo.testRayPlane( ray.start, ray.direction, center, front, result ) )
		return true;
	return false;
}

CameraController.prototype.onKey = function(e, key_event)
{
	if(!this._root || !this.enabled) 
		return;

	//trace(key_event);
	if(key_event.keyCode == 87)
	{
		if(key_event.type == "keydown")
			this._moving[2] = -1;
		else
			this._moving[2] = 0;
	}
	else if(key_event.keyCode == 83)
	{
		if(key_event.type == "keydown")
			this._moving[2] = 1;
		else
			this._moving[2] = 0;
	}
	else if(key_event.keyCode == 65)
	{
		if(key_event.type == "keydown")
			this._moving[0] = -1;
		else
			this._moving[0] = 0;
	}
	else if(key_event.keyCode == 68)
	{
		if(key_event.type == "keydown")
			this._moving[0] = 1;
		else
			this._moving[0] = 0;
	}
	else if(key_event.keyCode == 16) //shift in windows chrome
	{
		if(key_event.type == "keydown")
			this._move_fast = true;
		else
			this._move_fast = false;
	}

	//if(e.shiftKey) vec3.scale(this._moving,10);


	//LEvent.trigger(Scene,"change");
}

LS.registerComponent( CameraController );

/**
* Node manipulator, allows to rotate it
* @class NodeManipulator
* @constructor
* @param {String} object to configure from
*/

function NodeManipulator(o)
{
	this.rot_speed = [1,1]; //degrees
	this.smooth = false;
	if(o)
		this.configure(o);
}

NodeManipulator.icon = "mini-icon-rotator.png";

NodeManipulator.prototype.onAddedToNode = function(node)
{
	LEvent.bind( node, "mousemove",this.onMouse,this);
	LEvent.bind( node, "update",this.onUpdate,this);
}

NodeManipulator.prototype.onRemovedFromNode = function(node)
{
	LEvent.unbind( node, "mousemove",this.onMouse,this);
	LEvent.unbind( node, "update",this.onUpdate,this);
}

NodeManipulator.prototype.onUpdate = function(e)
{
	if(!this._root)
		return;

	if(!this._root.transform)
		return;
}

NodeManipulator.prototype.onMouse = function(e, mouse_event)
{
	if(!this._root || !this._root.transform)
		return;
	
	//regular mouse dragging
	if(!mouse_event.dragging)
		return;

	var scene = this._root.scene;
	var camera = scene.getCamera();

	var right = camera.getLocalVector( LS.Components.Transform.RIGHT );
	this._root.transform.rotateGlobal( mouse_event.deltax * this.rot_speed[0], LS.Components.Transform.UP );
	this._root.transform.rotateGlobal( mouse_event.deltay * this.rot_speed[1], right );
	scene.refresh();

	//this._root.transform.rotate(mouse_event.deltax * this.rot_speed[0], [0,1,0] );
	//this._root.transform.rotateLocal(-mouse_event.deltay * this.rot_speed[1], [1,0,0] );
}

LS.registerComponent(NodeManipulator);
/**
* Target rotate a mesh to look at the camera or another object
* @class Target
* @constructor
* @param {Object} object to configure from
*/

function Target(o)
{
	this.enabled = true;
	this.node_id = null;
	this.face_camera = false;
	this.cylindrical = false;
	this.front = Target.NEGZ;
	this.up = Target.POSY;
	
	this._target_position = vec3.create();

	if(o)
		this.configure(o);
}

Target.icon = "mini-icon-billboard.png";

Target.POSX = 1;
Target.NEGX = 2;
Target.POSY = 3;
Target.NEGY = 4;
Target.POSZ = 5;
Target.NEGZ = 6;

Target["@node_id"] = { type: 'node' };
Target["@front"] = { type: 'enum', values: { "-Z": Target.NEGZ,"+Z": Target.POSZ, "-Y": Target.NEGY,"+Y": Target.POSY,"-X": Target.NEGX,"+X": Target.POSX }};
Target["@up"] = { type: 'enum', values: { "-Z": Target.NEGZ,"+Z": Target.POSZ, "-Y": Target.NEGY,"+Y": Target.POSY,"-X": Target.NEGX,"+X": Target.POSX }};

Target.prototype.onAddedToNode = function(node)
{
	LEvent.bind( node, "computeVisibility", this.updateOrientation, this);
}

Target.prototype.onRemovedFromNode = function(node)
{
	LEvent.unbind( node, "computeVisibility", this.updateOrientation, this);
}


Target.prototype.updateOrientation = function(e)
{
	if(!this.enabled)
		return;

	if(!this._root || !this._root.transform ) 
		return;
	var scene = this._root.scene;

	var transform = this._root.transform;

	/*
	var dir = vec3.subtract( info.camera.getEye(), this._root.transform.getPosition(), vec3.create() );
	quat.lookAt( this._root.transform._rotation, dir, [0,1,0] );
	this._root.transform._dirty = true;
	*/

	var eye = null;
	var target_position = null;
	var up = null;
	var position = transform.getGlobalPosition();

	switch( this.up )
	{
		case Target.NEGX: up = vec3.fromValues(-1,0,0); break;
		case Target.POSX: up = vec3.fromValues(1,0,0); break;
		case Target.NEGZ: up = vec3.fromValues(0,0,-1); break;
		case Target.POSZ: up = vec3.fromValues(0,0,1); break;
		case Target.NEGY: up = vec3.fromValues(0,-1,0); break;
		case Target.POSY: 
		default:
			up = vec3.fromValues(0,1,0);
	}

	if( this.node_id )
	{
		var node = scene.getNode( this.node_id );
		if(!node || node == this._root ) //avoid same node
			return;
		target_position = node.transform.getGlobalPosition( this._target_position );
	}
	else if( this.face_camera )
	{
		var camera = LS.Renderer._main_camera ||  LS.Renderer._current_camera;
		if(!camera)
			return;
		target_position = camera.getEye();
	}
	else
		return;

	if( this.cylindrical )
	{
		target_position[1] = position[1];
		//up.set([0,1,0]);
	}

	transform.lookAt( position, target_position, up, true );

	switch( this.front )
	{
		case Target.POSY: quat.rotateX( transform._rotation, transform._rotation, Math.PI * -0.5 );	break;
		case Target.NEGY: quat.rotateX( transform._rotation, transform._rotation, Math.PI * 0.5 );	break;
		case Target.POSX: quat.rotateY( transform._rotation, transform._rotation, Math.PI * 0.5 );	break;
		case Target.NEGX: quat.rotateY( transform._rotation, transform._rotation, Math.PI * -0.5 );	break;
		case Target.POSZ: quat.rotateY( transform._rotation, transform._rotation, Math.PI );	break;
		case Target.NEGZ:
		default:
	}
}

LS.registerComponent( Target );
function FogFX(o)
{
	this.enabled = true;
	this.start = 100;
	this.end = 1000;
	this.density = 0.001;
	this.type = FogFX.LINEAR;
	this.color = vec3.fromValues(0.5,0.5,0.5);

	if(o)
		this.configure(o);
}

FogFX.icon = "mini-icon-fog.png";

FogFX.LINEAR = 1;
FogFX.EXP = 2;
FogFX.EXP2 = 3;

FogFX["@color"] = { type: "color" };
FogFX["@density"] = { type: "number", min: 0, max:1, step:0.0001, precision: 4 };
FogFX["@type"] = { type:"enum", values: {"linear": FogFX.LINEAR, "exponential": FogFX.EXP, "exponential 2": FogFX.EXP2 }};


FogFX.prototype.onAddedToScene = function(scene)
{
	//LEvent.bind( scene,"fillLightUniforms",this.fillUniforms,this);
	LEvent.bind( scene, "fillSceneQuery",this.fillSceneQuery,this);
	LEvent.bind( scene, "fillSceneUniforms",this.fillSceneUniforms,this);
}

FogFX.prototype.onRemovedFromScene = function(scene)
{
	//LEvent.unbind(Scene,"fillLightUniforms",this.fillUniforms,this);
	LEvent.unbind( scene, "fillSceneQuery",this.fillSceneQuery, this);
	LEvent.unbind( scene, "fillSceneUniforms",this.fillSceneUniforms, this);
}

FogFX.prototype.fillSceneQuery = function(e, query )
{
	if(!this.enabled)
		return;

	query.macros.USE_FOG = ""
	switch(this.type)
	{
		case FogFX.EXP:	query.macros.USE_FOG_EXP = ""; break;
		case FogFX.EXP2: query.macros.USE_FOG_EXP2 = ""; break;
	}
}

FogFX.prototype.fillSceneUniforms = function(e, uniforms )
{
	if(!this.enabled) return;

	uniforms.u_fog_info = [ this.start, this.end, this.density ];
	uniforms.u_fog_color = this.color;
}

LS.registerComponent(FogFX);
/**
* FollowNode 
* @class FollowNode
* @constructor
* @param {String} object to configure from
*/

function FollowNode(o)
{
	this.node_name = "";
	this.fixed_y = false;
	this.follow_camera = false;
	if(o)
		this.configure(o);
}

FollowNode.icon = "mini-icon-follow.png";

FollowNode.prototype.onAddedToNode = function(node)
{
	LEvent.bind(node,"computeVisibility", this.updatePosition, this);
}

FollowNode.prototype.onRemovedFromNode = function(node)
{
	LEvent.unbind(node,"computeVisibility", this.updatePosition, this);
}

FollowNode.prototype.updatePosition = function(e,info)
{
	if(!this._root) return;

	var pos = null;
	var scene = this._root.scene;
	var camera = scene.getCamera(); //main camera

	if(this.follow_camera)
		pos =  camera.getEye();
	else
	{
		var target_node = scene.getNode( this.node_name );
		if(!target_node) return;
		pos = target_node.transform.getPosition();
	}

	if(this.fixed_y)
		pos[1] = this._root.transform._position[1];
	this._root.transform.setPosition( pos );
}

LS.registerComponent( FollowNode );
/**
* GeometricPrimitive renders a primitive
* @class GeometricPrimitive
* @constructor
* @param {String} object to configure from
*/

function GeometricPrimitive( o )
{
	this.enabled = true;
	this.size = 10;
	this.subdivisions = 10;
	this.point_size = 0.1;
	this._geometry = GeometricPrimitive.CUBE;
	this._primitive = -1;
	this.align_z = false;

	if(o)
		this.configure(o);
}

Object.defineProperty( GeometricPrimitive.prototype, 'primitive', {
	get: function() { return this._primitive; },
	set: function(v) { 
		v = (v === undefined || v === null ? -1 : v|0);
		if(v != -1 && v != 0 && v!= 1 && v!= 4 && v!= 10)
			return;
		this._primitive = v;
	},
	enumerable: true
});

Object.defineProperty( GeometricPrimitive.prototype, 'geometry', {
	get: function() { return this._geometry; },
	set: function(v) { 
		v = (v === undefined || v === null ? -1 : v|0);
		if(v < 0 || v > 7)
			return;
		this._geometry = v;
	},
	enumerable: true
});

GeometricPrimitive.CUBE = 1;
GeometricPrimitive.PLANE = 2;
GeometricPrimitive.CYLINDER = 3;
GeometricPrimitive.SPHERE = 4;
GeometricPrimitive.CIRCLE = 5;
GeometricPrimitive.HEMISPHERE = 6;
GeometricPrimitive.ICOSAHEDRON = 7;
//Warning : if you add more primitives, be careful with the setter, it doesnt allow values bigger than 7

GeometricPrimitive.icon = "mini-icon-cube.png";
GeometricPrimitive["@geometry"] = { type:"enum", values: {"Cube":GeometricPrimitive.CUBE, "Plane": GeometricPrimitive.PLANE, "Cylinder":GeometricPrimitive.CYLINDER, "Sphere":GeometricPrimitive.SPHERE, "Icosahedron":GeometricPrimitive.ICOSAHEDRON, "Circle":GeometricPrimitive.CIRCLE, "Hemisphere":GeometricPrimitive.HEMISPHERE  }};
GeometricPrimitive["@primitive"] = {widget:"enum", values: {"Default":-1, "Points": 0, "Lines":1, "Triangles":4, "Wireframe":10 }};
GeometricPrimitive["@subdivisions"] = { type:"number", step:1, min:0 };
GeometricPrimitive["@point_size"] = { type:"number", step:0.001 };

//we bind to onAddedToNode because the event is triggered per node so we know which RIs belong to which node
GeometricPrimitive.prototype.onAddedToNode = function( node )
{
	LEvent.bind( node, "collectRenderInstances", this.onCollectInstances, this);
}

GeometricPrimitive.prototype.onRemovedFromNode = function( node )
{
	LEvent.unbind( node, "collectRenderInstances", this.onCollectInstances, this);
}

GeometricPrimitive.prototype.updateMesh = function()
{
	var subdivisions = Math.max(0,this.subdivisions|0);

	var key = "" + this.geometry + "|" + this.size + "|" + subdivisions + "|" + this.align_z;

	switch (this.geometry)
	{
		case GeometricPrimitive.CUBE: 
			this._mesh = GL.Mesh.cube({size: this.size, normals:true,coords:true});
			break;
		case GeometricPrimitive.PLANE:
			this._mesh = GL.Mesh.plane({size: this.size, detail: subdivisions, xz: this.align_z, normals:true,coords:true});
			break;
		case GeometricPrimitive.CYLINDER:
			this._mesh = GL.Mesh.cylinder({size: this.size, subdivisions: subdivisions, normals:true,coords:true});
			break;
		case GeometricPrimitive.SPHERE:
			this._mesh = GL.Mesh.sphere({size: this.size, "long":subdivisions, lat: subdivisions, normals:true,coords:true});
			break;
		case GeometricPrimitive.CIRCLE:
			this._mesh = GL.Mesh.circle({size: this.size, slices:subdivisions, xz: this.align_z, normals:true, coords:true});
			break;
		case GeometricPrimitive.HEMISPHERE:
			this._mesh = GL.Mesh.sphere({size: this.size, slices:subdivisions, xz: this.align_z, normals:true, coords:true, hemi: true});
			break;
		case GeometricPrimitive.ICOSAHEDRON:
			this._mesh = GL.Mesh.icosahedron({size: this.size, subdivisions:subdivisions });
			break;
	}
	this._key = key;
}

//GeometricPrimitive.prototype.getRenderInstance = function()
GeometricPrimitive.prototype.onCollectInstances = function(e, instances)
{
	if(!this.enabled)
		return;

	//if(this.size == 0) return;
	var mesh = null;
	if(!this._root)
		return;

	var subdivisions = Math.max(0,this.subdivisions|0);
	var key = "" + this.geometry + "|" + this.size + "|" + subdivisions + "|" + this.align_z;

	if(!this._mesh || this._key != key)
		this.updateMesh();

	var RI = this._render_instance;
	if(!RI)
		this._render_instance = RI = new LS.RenderInstance(this._root, this);

	if(this._root.transform)
		this._root.transform.getGlobalMatrix( RI.matrix );
	RI.setMatrix( RI.matrix ); //force normal
	//mat4.multiplyVec3( RI.center, RI.matrix, vec3.create() );
	mat4.getTranslation( RI.center, RI.matrix );
	RI.setMesh( this._mesh, this.primitive );
	this._root.mesh = this._mesh;
	
	RI.flags = RI_DEFAULT_FLAGS | RI_RAYCAST_ENABLED;
	RI.applyNodeFlags();
	RI.setMaterial( this.material || this._root.getMaterial() );

	if(this.primitive == gl.POINTS)
	{
		RI.uniforms.u_point_size = this.point_size;
		RI.query.macros["USE_POINTS"] = "";
	}

	instances.push(RI);
}

LS.registerComponent(GeometricPrimitive);


function GlobalInfo(o)
{
	this.createProperty( "ambient_color", GlobalInfo.DEFAULT_AMBIENT_COLOR, "color" );
	this.createProperty( "background_color", GlobalInfo.DEFAULT_BACKGROUND_COLOR, "color" );

	this._render_settings = new LS.RenderSettings();

	this._textures = {};

	if(o)
		this.configure(o);
}

Object.defineProperty( GlobalInfo.prototype, 'textures', {
	set: function( v )
	{
		if(typeof(v) != "object")
			return;
		for(var i in v)
			if( v[i] === null || v[i].constructor === String || v[i] === GL.Texture )
				this._textures[i] = v[i];
	},
	get: function(){
		return this._textures;
	},
	enumerable: true
});

Object.defineProperty( GlobalInfo.prototype, 'render_settings', {
	set: function( v )
	{
		if(typeof(v) != "object")
			return;
		this._render_settings.configure(v);
	},
	get: function(){
		return this._render_settings;
	},
	enumerable: true
});

GlobalInfo.icon = "mini-icon-bg.png";
GlobalInfo.DEFAULT_BACKGROUND_COLOR = new Float32Array([0,0,0,1]);
GlobalInfo.DEFAULT_AMBIENT_COLOR = vec3.fromValues(0.2, 0.2, 0.2);

GlobalInfo.prototype.onAddedToScene = function(scene)
{
	scene.info = this;
}

GlobalInfo.prototype.onRemovedFromScene = function(scene)
{
	//scene.info = null;
}

GlobalInfo.prototype.getResources = function(res)
{
	for(var i in this._textures)
	{
		if(typeof(this._textures[i]) == "string")
			res[ this._textures[i] ] = GL.Texture;
	}
	return res;
}

GlobalInfo.prototype.getProperties = function()
{
	return {
		"ambient_color":"color",
		"background_color":"color",
		"textures/environment": "texture",
		"textures/irradiance": "texture",
		"render_settings":"RenderSettings"
	};
}

GlobalInfo.prototype.setProperty = function( name, value )
{
	if(name.substr(0,9) == "textures/" && (!value || value.constructor === String || value.constructor === GL.Texture) )
	{
		this._textures[ name.substr(9) ] = value;
		return true;
	}
}

//used for animation tracks
GlobalInfo.prototype.getPropertyInfoFromPath = function( path )
{
	if(path[0] != "textures")
		return;

	if(path.length == 1)
		return {
			node: this._root,
			target: this._textures,
			type: "object"
		};

	var varname = path[1];

	return {
		node: this._root,
		target: this._textures,
		name: varname,
		value: this._textures[ varname ] || null,
		type: "texture"
	};
}

GlobalInfo.prototype.setPropertyValueFromPath = function( path, value, offset )
{
	offset = offset || 0;
	if( path.length < (offset+1) )
		return;

	if( path[offset] != "textures" )
		return;

	var varname = path[offset+1];
	this._textures[ varname ] = value;
}


GlobalInfo.prototype.onResourceRenamed = function (old_name, new_name, resource)
{
	for(var i in this._textures)
	{
		if(this._textures[i] == old_name)
			this._textures[i] = new_name;
	}
}

LS.registerComponent( GlobalInfo );
LS.GlobalInfo = GlobalInfo;
/* Requires LiteGraph.js ******************************/

//on include, link to resources manager
if(typeof(LGraphTexture) != "undefined")
{
	//link LGraph textures system with LiteScene
	LGraphTexture.getTexturesContainer = function() { return LS.ResourcesManager.textures };
	LGraphTexture.loadTexture = LS.ResourcesManager.load.bind( LS.ResourcesManager );
}

/**
* This component allow to integrate a behaviour graph on any object
* @class GraphComponent
* @param {Object} o object with the serialized info
*/
function GraphComponent(o)
{
	this.enabled = true;
	this.force_redraw = false;

	this.on_event = "update";

	if(typeof(LGraphTexture) == "undefined")
		return console.error("Cannot use GraphComponent if LiteGraph is not installed");

	this._graph = new LGraph();
	this._graph._scene = Scene;
	this._graph.getScene = function() { return this._scene; }

	if(o)
		this.configure(o);
	else //default
	{
		var graphnode = LiteGraph.createNode("scene/node");
		//graphnode.properties.node_id = ¿? not added yet
		this._graph.add(graphnode);
	}
	
	LEvent.bind(this,"trigger", this.trigger, this );	
}

GraphComponent["@on_event"] = { type:"enum", values: ["start","render","update","trigger"] };

GraphComponent.icon = "mini-icon-graph.png";

/**
* Returns the first component of this container that is of the same class
* @method configure
* @param {Object} o object with the configuration info from a previous serialization
*/
GraphComponent.prototype.configure = function(o)
{
	this.uid = o.uid;
	this.enabled = !!o.enabled;
	if(o.graph_data)
	{
		try
		{
			var obj = JSON.parse(o.graph_data);
			this._graph.configure( obj );
		}
		catch (err)
		{
			console.error("Error configuring Graph data: " + err);
		}
	}

	if(o.on_event)
		this.on_event = o.on_event;
	if(o.force_redraw)
		this.force_redraw = o.force_redraw;
}

GraphComponent.prototype.serialize = function()
{
	return { 
		uid: this.uid,
		enabled: this.enabled, 
		force_redraw: this.force_redraw , 
		graph_data: JSON.stringify( this._graph.serialize() ),
		on_event: this.on_event
	};
}

GraphComponent.prototype.onAddedToNode = function(node)
{
	this._graph._scenenode = node;
	//catch the global rendering
	//LEvent.bind( LS.GlobalScene, "beforeRenderMainPass", this.onBeforeRender, this );
}

GraphComponent.prototype.onRemovedFromNode = function(node)
{
	this._graph._scenenode = null;
	//LEvent.unbind( LS.GlobalScene, "beforeRenderMainPass", this.onBeforeRender, this );
}

GraphComponent.prototype.onAddedToScene = function( scene )
{
	LEvent.bind( scene ,"start", this.onEvent, this );
	LEvent.bind( scene , "beforeRenderMainPass", this.onEvent, this );
	LEvent.bind( scene ,"update", this.onEvent, this );
}

GraphComponent.prototype.onRemovedFromScene = function( scene )
{
	LEvent.unbind( scene,"start", this.onEvent, this );
	LEvent.unbind( scene,"beforeRenderMainPass", this.onEvent, this );
	LEvent.unbind( scene,"update", this.onEvent, this );
}

GraphComponent.prototype.onResourceRenamed = function(old_name, new_name, res)
{
	this._graph.sendEventToAllNodes("onResourceRenamed",[old_name, new_name, res]);
}

GraphComponent.prototype.onEvent = function(event_type, event_data)
{
	if(event_type == "beforeRenderMainPass")
		event_type = "render";

	if(this.on_event == event_type)
		this.runGraph();
}

GraphComponent.prototype.trigger = function(e)
{
	if(this.on_event == "trigger")
		this.runGraph();
}

GraphComponent.prototype.runGraph = function()
{
	if(!this._root._in_tree || !this.enabled)
		return;
	if(this._graph)
		this._graph.runStep(1);
	if(this.force_redraw)
		this._root.scene.refresh();
}

GraphComponent.prototype.getGraph = function()
{
	return this._graph;
}

GraphComponent.prototype.getPropertyValue = function( property )
{
	var nodes = this._graph.findNodesByType("scene/global");
	if(nodes.length)
	{
		for(var i = 0; i < nodes.length; ++i)
		{
			var n = nodes[i];
			var type = n.properties.type;
			if(n.properties.name != property)
				continue;

			return n.properties.value;
		}
	}
}


GraphComponent.prototype.setPropertyValue = function( property, value )
{
	var nodes = this._graph.findNodesByType("scene/global");
	if(nodes.length)
	{
		for(var i = 0; i < nodes.length; ++i)
		{
			var n = nodes[i];
			var type = n.properties.type;
			if(n.properties.name != property)
				continue;

			if(n.properties.value && n.properties.value.set)
				n.properties.value.set(value);
			else
				n.properties.value = value;
			return true;
		}
	}
}

LS.registerComponent( GraphComponent );



/**
* This component allow to integrate a rendering post FX using a graph
* @class FXGraphComponent
* @param {Object} o object with the serialized info
*/
function FXGraphComponent(o)
{
	this.enabled = true;
	this.use_viewport_size = true;
	this.use_high_precision = false;
	this.use_antialiasing = false;
	this.use_extra_texture = false;
	this.use_node_camera = false;


	if(typeof(LGraphTexture) == "undefined")
		return console.error("Cannot use GraphComponent if LiteGraph is not installed");

	this._graph = new LGraph();
	this._graph._scene = Scene;
	this._graph.getScene = function() { return this._scene; }

	if(o)
	{
		this.configure(o);
	}
	else //default
	{
		this._graph_frame_node = LiteGraph.createNode("scene/frame","Rendered Frame");
		this._graph_frame_node.ignore_remove = true;
		this._graph_frame_node.ignore_rename = true;
		this._graph.add( this._graph_frame_node );

		this._graph_viewport_node = LiteGraph.createNode("texture/toviewport","Viewport");
		this._graph_viewport_node.pos[0] = 500;
		this._graph.add( this._graph_viewport_node );

		this._graph_frame_node.connect(0, this._graph_viewport_node );

		/*
		this._graph_color_texture_node = LiteGraph.createNode("texture/texture","Color Buffer");
		this._graph_color_texture_node.ignore_remove = true;

		this._graph_depth_texture_node = LiteGraph.createNode("texture/texture","Depth Buffer");
		this._graph_depth_texture_node.ignore_remove = true;
		this._graph_depth_texture_node.pos[1] = 400;

		this._graph_extra_texture_node = LiteGraph.createNode("texture/texture","Extra Buffer");
		this._graph_extra_texture_node.pos[1] = 800;
		this._graph_extra_texture_node.ignore_remove = true;
	
		this._graph.add( this._graph_color_texture_node );
		this._graph.add( this._graph_extra_texture_node );
		this._graph.add( this._graph_depth_texture_node );

		this._graph_viewport_node = LiteGraph.createNode("texture/toviewport","Viewport");
		this._graph_viewport_node.pos[0] = 500;
		this._graph.add( this._graph_viewport_node );

		this._graph_color_texture_node.connect(0, this._graph_viewport_node );
		*/
	}

	if(FXGraphComponent.high_precision_format == null)
	{
		if(gl.half_float_ext)
			FXGraphComponent.high_precision_format = gl.HALF_FLOAT_OES;
		else if(gl.float_ext)
			FXGraphComponent.high_precision_format = gl.FLOAT;
		else
			FXGraphComponent.high_precision_format = gl.UNSIGNED_BYTE;
	}
}

FXGraphComponent.icon = "mini-icon-graph.png";
FXGraphComponent.buffer_size = [1024,512];

/**
* Returns the first component of this container that is of the same class
* @method configure
* @param {Object} o object with the configuration info from a previous serialization
*/
FXGraphComponent.prototype.configure = function(o)
{
	if(!o.graph_data)
		return;

	this.uid = o.uid;
	this.enabled = !!o.enabled;
	this.use_viewport_size = !!o.use_viewport_size;
	this.use_high_precision = !!o.use_high_precision;
	this.use_antialiasing = !!o.use_antialiasing;
	this.use_extra_texture = !!o.use_extra_texture;
	this.use_node_camera = !!o.use_node_camera;

	this._graph.configure( JSON.parse( o.graph_data ) );

	this._graph_frame_node = this._graph.findNodesByTitle("Rendered Frame")[0];
	this._graph_viewport_node = this._graph.findNodesByType("texture/toviewport")[0];

	if(!this._graph_frame_node) //LEGACY CODE, DELETE AT SOME POINT
	{
		console.log("CONVERTING LEGACY DATA TO NEW FORMAT");
		
		this._graph_frame_node = LiteGraph.createNode("scene/frame","Rendered Frame");
		this._graph_frame_node.ignore_remove = true;
		this._graph_frame_node.ignore_rename = true;
		this._graph.add( this._graph_frame_node );

		var old_nodes = ["Color Buffer","Depth Buffer","Extra Buffer"];
		for(var j = 0; j < old_nodes.length; ++j)
		{
			var old_node = this._graph.findNodesByTitle(old_nodes[j])[0];
			if(!old_node)
				continue;

			var connection_info = old_node.getOutputInfo(0);
			if(!connection_info.links)
				continue;
			var links = connection_info.links.concat();
			for(var i in links)
			{
				var link = this._graph.links[ links[i] ];
				if(!link)
					continue;
				this._graph_frame_node.connect( j, link.target_id, link.target_slot ); 
			}
			this._graph.remove( old_node );
		}
	}
}

FXGraphComponent.prototype.serialize = function()
{
	return {
		uid: this.uid,
		enabled: this.enabled,
		use_antialiasing: this.use_antialiasing,
		use_high_precision: this.use_high_precision,
		use_extra_texture: this.use_extra_texture,
		use_viewport_size: this.use_viewport_size,
		use_node_camera: this.use_node_camera,

		graph_data: JSON.stringify( this._graph.serialize() )
	};
}

FXGraphComponent.prototype.getResources = function(res)
{
	var nodes = this._graph.findNodesByType("texture/texture");
	for(var i in nodes)
	{
		if(nodes[i].properties.name)
			res[nodes[i].properties.name] = Texture;
	}
	return res;
}

FXGraphComponent.prototype.getPropertyValue = function( property )
{
	var nodes = this._graph.findNodesByType("scene/global");
	if(nodes.length)
	{
		for(var i = 0; i < nodes.length; ++i)
		{
			var n = nodes[i];
			var type = n.properties.type;
			if(n.properties.name != property)
				continue;

			return n.properties.value;
		}
	}
}


FXGraphComponent.prototype.setPropertyValue = function( property, value )
{
	var nodes = this._graph.findNodesByType("scene/global");
	if(nodes.length)
	{
		for(var i = 0; i < nodes.length; ++i)
		{
			var n = nodes[i];
			var type = n.properties.type;
			if(n.properties.name != property)
				continue;

			if(n.properties.value && n.properties.value.set)
				n.properties.value.set(value);
			else
				n.properties.value = value;
			return true;
		}
	}
}


FXGraphComponent.prototype.getGraph = function()
{
	return this._graph;
}

FXGraphComponent.prototype.onResourceRenamed = function(old_name, new_name, res)
{
	this._graph.sendEventToAllNodes("onResourceRenamed",[old_name, new_name, res]);
}

FXGraphComponent.prototype.onAddedToNode = function(node)
{
	this._graph._scenenode = node;
	//catch the global rendering
	//LEvent.bind( LS.GlobalScene, "beforeRenderMainPass", this.onBeforeRender, this );
}

FXGraphComponent.prototype.onRemovedFromNode = function(node)
{
	this._graph._scenenode = null;
	//LEvent.unbind( LS.GlobalScene, "beforeRenderMainPass", this.onBeforeRender, this );
}

FXGraphComponent.prototype.onAddedToScene = function( scene )
{
	LEvent.bind( scene, "enableFrameBuffer", this.onBeforeRender, this );
	LEvent.bind( scene, "showFrameBuffer", this.onAfterRender, this );
}

FXGraphComponent.prototype.onRemovedFromScene = function( scene )
{
	LEvent.unbind( scene, "enableFrameBuffer", this.onBeforeRender, this );
	LEvent.unbind( scene, "showFrameBuffer", this.onAfterRender, this );

	LS.ResourcesManager.unregisterResource( ":color_" + this.uid );
	LS.ResourcesManager.unregisterResource( ":depth_" + this.uid );
	LS.ResourcesManager.unregisterResource( ":extra_" + this.uid );
}


FXGraphComponent.prototype.onBeforeRender = function(e, render_settings)
{
	this._last_camera = LS.Renderer._current_camera;

	if(!this.enabled)
	{
		if( this._binded_camera )
		{
			LEvent.unbindAll( this._binded_camera, this );
			this._binded_camera = null;
		}
		return;
	}

	//FBO for one camera
	if(this.use_node_camera)
	{
		var camera = this._root.camera;
		if(camera && camera != this._binded_camera)
		{
			if(this._binded_camera)
				LEvent.unbindAll( this._binded_camera, this );
			LEvent.bind( camera, "enableFrameBuffer", this.enableCameraFBO, this );
			LEvent.bind( camera, "showFrameBuffer", this.showCameraFBO, this );
		}
		this._binded_camera = camera;
		return;
	}
	else if( this._binded_camera )
	{
		LEvent.unbindAll( this._binded_camera, this );
		this._binded_camera = null;
	}

	this.enableGlobalFBO( render_settings );
}

FXGraphComponent.prototype.onAfterRender = function(e, render_settings )
{
	if(!this.enabled)
		return;

	if(this.use_node_camera)
		return;

	this.showFBO();
}

FXGraphComponent.prototype.enableCameraFBO = function(e, render_settings )
{
	if(!this.enabled)
		return;

	if(!this._renderFrameContainer)
		this._renderFrameContainer = new LS.RenderFrameContainer();
	var camera = this._binded_camera;
	
	var viewport = this._viewport = camera.getLocalViewport( null, this._viewport );
	this._renderFrameContainer.setSize( viewport[2], viewport[3] );
	this._renderFrameContainer.use_high_precision = this.use_high_precision;
	this._renderFrameContainer.preRender( render_settings );

	render_settings.ignore_viewports = true;
}

FXGraphComponent.prototype.showCameraFBO = function(e, render_settings )
{
	if(!this.enabled)
		return;
	render_settings.ignore_viewports = false;
	this.showFBO();
}

FXGraphComponent.prototype.enableGlobalFBO = function( render_settings )
{
	if(!this.enabled)
		return;

	var RFC = this._renderFrameContainer;
	if(!RFC)
		RFC = this._renderFrameContainer = new LS.RenderFrameContainer();

	//configure
	if(this.use_viewport_size)
		RFC.useCanvasSize();
	RFC.use_high_precision = this.use_high_precision;
	RFC.use_extra_texture = this.use_extra_texture;
	RFC.preRender( render_settings );
}

FXGraphComponent.prototype.showFBO = function()
{
	if(!this.enabled)
		return;

	var RFC = this._renderFrameContainer;
	RFC.endFBO();

	LS.ResourcesManager.textures[":color_" + this.uid] = RFC.color_texture;
	LS.ResourcesManager.textures[":depth_" + this.uid] = RFC.depth_texture;
	if(this.extra_texture)
		LS.ResourcesManager.textures[":extra_" + this.uid] = RFC.extra_texture;

	if(this.use_node_camera && this._viewport)
	{
		gl.setViewport( this._viewport );
		this.applyGraph();
		gl.setViewport( RFC._fbo._old_viewport );
	}
	else
		this.applyGraph();
}



/*
//used to create the buffers
FXGraphComponent.prototype.onBeforeRender = function(e, render_settings)
{
	if(!this._graph || !render_settings.render_fx || !this.enabled ) 
		return;

	//create RenderFrameContainer
	var RFC = this._renderFrameContainer;
	if(!RFC)
	{
		RFC = this._renderFrameContainer = new LS.RenderFrameContainer();
		RFC.use_depth_texture = true;
		RFC.component = this;
		RFC.postRender = FXGraphComponent.postRender;
	}

	//configure RFC
	RFC.use_high_precision = this.use_high_precision;
	if(this.use_viewport_size)
		RFC.useCanvasSize();
	else
		RFC.useDefaultSize();
	RFC.use_extra_texture = this.use_extra_texture;

	//assign global render frame container
	//LS.Renderer.assignGlobalRenderFrameContainer( RFC );
}
*/


//take the resulting textures and pass them through the graph
FXGraphComponent.prototype.applyGraph = function()
{
	if(!this._graph)
		return;

	if(!this._graph_frame_node)
		this._graph_frame_node = this._graph.findNodesByTitle("Rendered Frame")[0];
	this._graph_frame_node._color_texture = ":color_" + this.uid;
	this._graph_frame_node._depth_texture = ":depth_" + this.uid;
	this._graph_frame_node._extra_texture = ":extra_" + this.uid;
	this._graph_frame_node._camera = this._last_camera;

	if(this._graph_viewport_node) //force antialiasing
		this._graph_viewport_node.properties.antialiasing = this.use_antialiasing;

	//find graph nodes that contain the texture info
	/*
	if(!this._graph_color_texture_node)
		this._graph_color_texture_node = this._graph.findNodesByTitle("Color Buffer")[0];
	if(!this._graph_depth_texture_node)
		this._graph_depth_texture_node = this._graph.findNodesByTitle("Depth Buffer")[0];
	if(!this._graph_extra_texture_node)
		this._graph_extra_texture_node = this._graph.findNodesByTitle("Extra Buffer")[0];
	if(!this._graph_viewport_node)
		this._graph_viewport_node = this._graph.findNodesByType("texture/toviewport")[0];

	if(!this._graph_color_texture_node)
		return;

	//fill the graph nodes with proper info
	this._graph_color_texture_node.properties.name = ":color_" + this.uid;
	if(this._graph_depth_texture_node)
		this._graph_depth_texture_node.properties.name = ":depth_" + this.uid;
	if(this._graph_extra_texture_node)
		this._graph_extra_texture_node.properties.name = ":extra_" + this.uid;
	if(this._graph_viewport_node) //force antialiasing
		this._graph_viewport_node.properties.antialiasing = this.use_antialiasing;
	*/

	//execute graph
	this._graph.runStep(1);
}

//Executed inside RenderFrameContainer **********
/*
FXGraphComponent.prototype.onPreRender = function( cameras, render_settings )
{
	//TODO: MIGRATE TO RenderFrameContainer

	//Setup FBO
	this._fbo = this._fbo || gl.createFramebuffer();
	gl.bindFramebuffer( gl.FRAMEBUFFER, this._fbo );

	var color_texture = this.component.color_texture;
	var depth_texture = this.component.depth_texture;

	gl.viewport(0, 0, color_texture.width, color_texture.height );
	LS.Renderer._full_viewport.set( gl.viewport_data );

	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, color_texture.handler, 0);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT,  gl.TEXTURE_2D, depth_texture.handler, 0);

	//set depth info
	var camera = cameras[0];
	if(!depth_texture.near_far_planes)
		depth_texture.near_far_planes = vec2.create();
	depth_texture.near_far_planes[0] = camera.near;
	depth_texture.near_far_planes[1] = camera.far;

	LS.Renderer.global_aspect = (gl.canvas.width / gl.canvas.height) / (color_texture.width / color_texture.height);
	//ready to render the scene, which is done from the LS.Renderer.render
}


//Executed inside RFC
FXGraphComponent.postRender = function()
{
	this.endFBO();

	LS.ResourcesManager.textures[":color_" + this.component.uid] = this.color_texture;
	if(this.extra_texture)
		LS.ResourcesManager.textures[":extra_" + this.component.uid] = this.extra_texture;
	if(this.depth_texture)
		LS.ResourcesManager.textures[":depth_" + this.component.uid] = this.depth_texture;

	//apply FX
	this.component.applyGraph();
}
*/

//************************************




LS.registerComponent( FXGraphComponent );









(function(){

/**
* Knob allows to rotate a mesh like a knob (rotate when dragging)
* @class Knob
* @constructor
* @param {String} object to configure from
*/

function Knob(o)
{
	this.value = 0;
	this.delta = 0.01;

	this.steps = 0; //0 = continuous
	this.min_value = 0;
	this.max_value = 1;
	this.min_angle = -120;
	this.max_angle = 120;
	this.axis = vec3.fromValues(0,0,1);

	if(o)
		this.configure(o);
}

Knob.icon = "mini-icon-knob.png";

Knob.prototype.onAddedToScene = function(scene)
{
	LEvent.bind( scene, "mousemove", this.onmousemove, this );
	this.updateKnob();
}

Knob.prototype.onRemovedFromScene = function(scene)
{
	LEvent.unbindAll( scene, this );
}


Knob.prototype.updateKnob = function() {
	if(!this._root)
		return;
	var f = this.value / (this.max_value - this.min_value)
	quat.setAxisAngle(this._root.transform._rotation,this.axis, (this.min_angle + (this.max_angle - this.min_angle) * f )* DEG2RAD);
	this._root.transform._dirty = true;
}

Knob.prototype.onmousemove = function(e, mouse_event) { 
	this.value -= mouse_event.deltay * this.delta;

	if(this.value > this.max_value) this.value = this.max_value;
	else if(this.value < this.min_value) this.value = this.min_value;

	this.updateKnob();

	LEvent.trigger( this, "change", this.value);
	if(this._root)
		LEvent.trigger( this._root, "knobChange", this.value );

	return false;
};

LS.registerComponent( Knob );

})();
function Particle()
{
	this.id = 0;
	this._pos = vec3.fromValues(0,0,0);
	this._vel = vec3.fromValues(0,0,0);
	this.life = 1;
	this.angle = 0;
	this.size = 1;
	this.rot = 0;
}

Object.defineProperty( Particle.prototype, 'pos', {
	get: function() { return this._pos; },
	set: function(v) { this._pos.set(v); },
	enumerable: true
});

Object.defineProperty( Particle.prototype, 'vel', {
	get: function() { return this._vel; },
	set: function(v) { this._vel.set(v); },
	enumerable: true
});


function ParticleEmissor(o)
{
	this.enabled = true;

	this.max_particles = 1024;
	this.warm_up_time = 0;
	this.point_particles = false;

	this.emissor_type = ParticleEmissor.BOX_EMISSOR;
	this.emissor_rate = 5; //particles per second
	this.emissor_size = vec3.fromValues(10,10,10);
	this.emissor_mesh = null;

	this.particle_life = 5;
	this.particle_speed = 10;
	this.particle_size = 5;
	this.particle_rotation = 0;
	this.particle_size_curve = [[1,1]];

	this._particle_start_color = vec3.fromValues(1,1,1);
	this._particle_end_color = vec3.fromValues(1,1,1);

	this.particle_opacity_curve = [[0.5,1]];

	this.texture_grid_size = 1;

	this._custom_emissor_code = null;
	this._custom_update_code = null;

	//physics
	this.physics_gravity = [0,0,0];
	this.physics_friction = 0;

	//material
	this.opacity = 1;
	this.additive_blending = false;
	this.texture = null;
	this.animation_fps = 1;
	this.soft_particles = false;

	this.use_node_material = false; 
	this.animated_texture = false; //change frames
	this.loop_animation = false;
	this.independent_color = false;
	this.premultiplied_alpha = false;
	this.align_with_camera = true;
	this.align_always = false; //align with all cameras
	this.follow_emitter = false;
	this.sort_in_z = true; //slower
	this.stop_update = false; //do not move particles

	if(o)
		this.configure(o);

	//LEGACY!!! sizes where just a number before
	if(typeof(this.emissor_size) == "number")
		this.emissor_size = [this.emissor_size,this.emissor_size,this.emissor_size];

	this._emissor_pos = vec3.create();
	this._particles = [];
	this._remining_dt = 0;
	this._visible_particles = 0;
	this._min_particle_size = 0.001;
	this._last_id = 0;

	this.createMesh();

	
	/* demo particles
	for(var i = 0; i < this.max_particles; i++)
	{
		var p = this.createParticle();
		this._particles.push(p);
	}
	*/
}

ParticleEmissor.BOX_EMISSOR = 1;
ParticleEmissor.SPHERE_EMISSOR = 2;
ParticleEmissor.MESH_EMISSOR = 3;
ParticleEmissor.CUSTOM_EMISSOR = 10;

ParticleEmissor["@emissor_type"] = { type:"enum", values:{ "Box":ParticleEmissor.BOX_EMISSOR, "Sphere":ParticleEmissor.SPHERE_EMISSOR, "Mesh":ParticleEmissor.MESH_EMISSOR, "Custom": ParticleEmissor.CUSTOM_EMISSOR }};
ParticleEmissor.icon = "mini-icon-particles.png";

Object.defineProperty( ParticleEmissor.prototype, 'particle_start_color', {
	get: function() { return this._particle_start_color; },
	set: function(v) { 
		if(v)
			this._particle_start_color.set(v); 
	},
	enumerable: true
});

Object.defineProperty( ParticleEmissor.prototype, 'particle_end_color', {
	get: function() { return this._particle_end_color; },
	set: function(v) { 
		if(v)
			this._particle_end_color.set(v); 
	},
	enumerable: true
});


Object.defineProperty( ParticleEmissor.prototype , 'custom_emissor_code', {
	get: function() { return this._custom_emissor_code; },
	set: function(v) { 
		v = LScript.cleanCode(v);
		this._custom_emissor_code = v;
		try
		{
			if(v && v.length)
				this._custom_emissor_func = new Function("p",v);
			else
				this._custom_emissor_func = null;
		}
		catch (err)
		{
			console.error("Error in ParticleEmissor custom emissor code: ", err);
		}
	},
	enumerable: true
});

Object.defineProperty( ParticleEmissor.prototype , 'custom_update_code', {
	get: function() { return this._custom_update_code; },
	set: function(v) { 
		v = LScript.cleanCode(v);
		this._custom_update_code = v;
		try
		{
			if(v && v.length)
				this._custom_update_func = new Function("p","dt",v);
			else
				this._custom_update_func = null;
		}
		catch (err)
		{
			console.error("Error in ParticleEmissor custom emissor code: ", err);
		}
	},
	enumerable: true
});


ParticleEmissor.prototype.onAddedToScene = function(scene)
{
	LEvent.bind( scene, "update",this.onUpdate,this);
	LEvent.bind( scene, "start",this.onStart,this);
	LEvent.bind( scene, "collectRenderInstances", this.onCollectInstances, this);
	LEvent.bind( scene, "afterCameraEnabled",this.onAfterCamera, this);
}

ParticleEmissor.prototype.onRemovedFromScene = function(scene)
{
	LEvent.unbindAll( scene, this );
}

ParticleEmissor.prototype.getResources = function(res)
{
	if(this.emissor_mesh)
		res[ this.emissor_mesh ] = Mesh;
	if(this.texture)
		res[ this.texture ] = Texture;
}

ParticleEmissor.prototype.onResourceRenamed = function (old_name, new_name, resource)
{
	if(this.emissor_mesh == old_name)
		this.emissor_mesh = new_name;
	if(this.texture == old_name)
		this.texture = new_name;
}

ParticleEmissor.prototype.onAfterCamera = function(e,camera)
{
	if(!this.enabled)
		return;

	if(this.align_always)
		this.updateMesh( camera );
}

ParticleEmissor.prototype.createParticle = function(p)
{
	p = p || new Particle();
	
	switch(this.emissor_type)
	{
		case ParticleEmissor.BOX_EMISSOR: p._pos.set( [this.emissor_size[0] * ( Math.random() - 0.5), this.emissor_size[1] * ( Math.random() - 0.5 ), this.emissor_size[2] * (Math.random() - 0.5) ]); break;
		case ParticleEmissor.SPHERE_EMISSOR: 
			var gamma = 2 * Math.PI * Math.random();
			var theta = Math.acos(2 * Math.random() - 1);
			p._pos.set( [Math.sin(theta) * Math.cos(gamma), Math.sin(theta) * Math.sin(gamma), Math.cos(theta) ]);
			vec3.multiply( p.pos, p.pos, this.emissor_size); 
			break;
			//p.pos = vec3.multiply( vec3.normalize( vec3.create( [(Math.random() - 0.5), ( Math.random() - 0.5 ), (Math.random() - 0.5)])), this.emissor_size); break;
		case ParticleEmissor.MESH_EMISSOR: 
			var mesh = this.emissor_mesh;
			if(mesh && mesh.constructor === String)
				mesh = LS.ResourcesManager.getMesh(this.emissor_mesh);
			if(mesh && mesh.getBuffer("vertices") )
			{
				var vertices = mesh.getBuffer("vertices").data;				
				var v = Math.floor(Math.random() * vertices.length / 3)*3;
				p._pos.set( [vertices[v] + Math.random() * 0.001, vertices[v+1] + Math.random() * 0.001, vertices[v+2] + Math.random() * 0.001] );
			}
			else
				p._pos.set([0,0,0]);
			break;
		case ParticleEmissor.CUSTOM_EMISSOR: //done after the rest
		default: 
	}

	p._vel.set( [Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5 ] );
	p.life = this.particle_life;
	p.id = this._last_id;
	p.angle = 0;
	p.size = 1;
	p.rot = this.particle_rotation + 0.25 * this.particle_rotation * Math.random();

	this._last_id += 1;
	if(this.independent_color)
		p.c = vec3.clone( this.particle_start_color );

	vec3.scale(p._vel, p._vel, this.particle_speed);

	//after everything so the user can edit whatever he wants
	if(this.emissor_type == ParticleEmissor.CUSTOM_EMISSOR && this._custom_emissor_func)
		this._custom_emissor_func.call( this, p );

	//this._root.transform.transformPoint(p.pos, p.pos);
	if(!this.follow_emitter) //the transform will be applyed in the matrix
		vec3.add(p._pos, p._pos, this._emissor_pos);

	return p;
}

ParticleEmissor.prototype.onStart = function(e)
{
	if(!this.enabled)
		return;

	if(this.warm_up_time <= 0)
		return;

	var delta = 1/30;
	for(var i = 0; i < this.warm_up_time; i+= delta)
		this.onUpdate( null, delta, true);
}

ParticleEmissor.prototype.onUpdate = function(e, dt, do_not_updatemesh )
{
	if(!this.enabled)
		return;

	if(!this._root.scene)
		throw("update without scene? impossible");

	if(this._root.transform)
		this._root.transform.getGlobalPosition(this._emissor_pos);

	if(this.emissor_rate < 0) this.emissor_rate = 0;

	if(!this.stop_update)
	{
		//update particles
		var gravity = vec3.clone(this.physics_gravity);
		var friction = this.physics_friction;
		var particles = [];
		var vel = vec3.create();
		var rot = this.particle_rotation * dt;

		for(var i = 0, l = this._particles.length; i < l; ++i)
		{
			var p = this._particles[i];

			vec3.copy(vel, p._vel);
			vec3.add(vel, gravity, vel);
			vec3.scale(vel, vel, dt);

			if(friction)
			{
				vel[0] -= vel[0] * friction;
				vel[1] -= vel[1] * friction;
				vel[2] -= vel[2] * friction;
			}

			vec3.add( p._pos, vel, p._pos);

			p.angle += p.rot * dt;
			p.life -= dt;

			if(this._custom_update_func)
				this._custom_update_func.call(this,p,dt);

			if(p.life > 0) //keep alive
				particles.push(p);
		}

		//emit new
		if(this.emissor_rate != 0)
		{
			var new_particles = (dt + this._remining_dt) * this.emissor_rate;
			this._remining_dt = (new_particles % 1) / this.emissor_rate;
			new_particles = new_particles<<0;

			if(new_particles > this.max_particles)
				new_particles = this.max_particles;

			for(var i = 0; i < new_particles; i++)
			{
				var p = this.createParticle();
				if(particles.length < this.max_particles)
					particles.push(p);
			}
		}

		//replace old container with new one
		this._particles = particles;
	}

	//compute mesh
	if(!this.align_always && !do_not_updatemesh)
		this.updateMesh( LS.Renderer._current_camera );

	//send change
	LEvent.trigger( this._root.scene , "change");
}

ParticleEmissor.prototype.createMesh = function ()
{
	if( this._mesh_maxparticles == this.max_particles)
		return;

	this._vertices = new Float32Array(this.max_particles * 6 * 3); //6 vertex per particle x 3 floats per vertex
	this._coords = new Float32Array(this.max_particles * 6 * 2);
	this._colors = new Float32Array(this.max_particles * 6 * 4);
	this._extra2 = new Float32Array(this.max_particles * 2);

	var default_coords = [1,1, 0,1, 1,0,  0,1, 0,0, 1,0];
	var default_color = [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1];

	for(var i = 0; i < this.max_particles; i++)
	{
		this._coords.set( default_coords , i*6*2);
		this._colors.set( default_color , i*6*4);
		this._extra2[i*2] = 1;
		this._extra2[i*2+1] = i;
	}

	this._computed_grid_size = 1;
	//this._mesh = Mesh.load({ vertices:this._vertices, coords: this._coords, colors: this._colors, stream_type: gl.STREAM_DRAW });
	this._mesh = new GL.Mesh();
	this._mesh.addBuffers({ vertices:this._vertices, coords: this._coords, colors: this._colors, extra2: this._extra2 }, null, gl.STREAM_DRAW);
	this._mesh_maxparticles = this.max_particles;
}

ParticleEmissor.prototype.updateMesh = function (camera)
{
	if(!camera) //no main camera specified (happens at early updates)
		return;

	if( this._mesh_maxparticles != this.max_particles) 
		this.createMesh();

	var center = camera.getEye(); 

	var MIN_SIZE = this._min_particle_size;

	/*
	if(this.follow_emitter)
	{
		var iM = this._root.transform.getMatrix();
		mat4.multiplyVec3(iM, center);
	}
	*/

	var front = camera.getLocalVector([0,0,1]);
	var right = camera.getLocalVector([1,0,0]);
	var top = camera.getLocalVector([0,1,0]);
	var temp = vec3.create();
	var size = this.particle_size;

	var topleft = vec3.fromValues(-1,0,-1);
	var topright = vec3.fromValues(1,0,-1);
	var bottomleft = vec3.fromValues(-1,0,1);
	var bottomright = vec3.fromValues(1,0,1);

	if(this.align_with_camera)
	{
		vec3.subtract(topleft, top,right);
		vec3.add(topright, top,right);
		vec3.scale(bottomleft,topright,-1);
		vec3.scale(bottomright,topleft,-1);
	}

	//scaled versions
	var s_topleft = vec3.create()
	var s_topright = vec3.create()
	var s_bottomleft = vec3.create()
	var s_bottomright = vec3.create()

	var particles = this._particles;
	if(this.sort_in_z)
	{
		particles = this._particles.concat(); //copy
		var plane = geo.createPlane(center, front); //compute camera plane
		var den = 1 / Math.sqrt(plane[0]*plane[0] + plane[1]*plane[1] + plane[2]*plane[2]); //delta
		for(var i = 0; i < particles.length; ++i)
			particles[i]._dist = Math.abs(vec3.dot(particles[i]._pos,plane) + plane[3]) * den;
			//particles[i]._dist = vec3.dist( center, particles[i].pos );
		particles.sort(function(a,b) { return a._dist < b._dist ? 1 : (a._dist > b._dist ? -1 : 0); });
		this._particles = particles;
	}

	//avoid errors
	if(this.particle_life == 0) this.particle_life = 0.0001;

	var color = new Float32Array([1,1,1,1]);
	var particle_start_color = this._particle_start_color;
	var particle_end_color = this._particle_end_color;

	//used for grid based textures
	var recompute_coords = false;
	if((this._computed_grid_size != this.texture_grid_size || this.texture_grid_size > 1) || this.point_particles)
	{
		recompute_coords = true;
		this._computed_grid_size = this.texture_grid_size;
	}
	var texture_grid_size = this.texture_grid_size;
	var d_uvs = 1 / this.texture_grid_size;
	var offset_u = 0, offset_v = 0;
	var grid_frames = this.texture_grid_size<<2;
	var animated_texture = this.animated_texture;
	var loop_animation = this.loop_animation;
	var time = this._root.scene.getTime() * this.animation_fps;

	//used for precompute curves to speed up (sampled at 60 frames per second)
	var recompute_colors = true;
	var opacity_curve = new Float32Array((this.particle_life * 60)<<0);
	var size_curve = new Float32Array((this.particle_life * 60)<<0);
	var particle_size = this.particle_size;

	var dI = 1 / (this.particle_life * 60);
	for(var i = 0; i < opacity_curve.length; i += 1)
	{
		opacity_curve[i] = LS.getCurveValueAt(this.particle_opacity_curve,0,1,0, i * dI );
		size_curve[i] = LS.getCurveValueAt(this.particle_size_curve,0,1,0, i * dI );
	}

	//references
	var points = this.point_particles;
	var max_vertices = this._vertices.length;
	var vertices = this._vertices;
	var colors = this._colors;
	var extra2 = this._extra2;
	var coords = this._coords;

	//used for rotations
	var rot = quat.create();

	//generate quads
	var i = 0, f = 0;
	for( var iParticle = 0, l = particles.length; iParticle < l; ++iParticle )
	{
		var p = particles[iParticle];
		if(p.life <= 0)
			continue;

		f = 1.0 - p.life / this.particle_life;

		if(recompute_colors) //compute color and opacity
		{
			var a = opacity_curve[(f*opacity_curve.length)<<0]; //getCurveValueAt(this.particle_opacity_curve,0,1,0,f);

			if(this.independent_color && p.c)
				vec3.clone(color,p.c);
			else
				vec3.lerp(color, particle_start_color, particle_end_color, f);

			if(this.premultiplied_alpha)
			{
				vec3.scale(color,color,a);
				color[3] = 1.0;
			}
			else
				color[3] = a;

			if(a < 0.001) continue;
		}

		var s = p.size * size_curve[(f*size_curve.length)<<0]; //getCurveValueAt(this.particle_size_curve,0,1,0,f);

		if(Math.abs(s * particle_size) < MIN_SIZE)
			continue; //ignore almost transparent particles

		if(points)
		{
			vertices.set(p._pos, i*3);
			colors.set(color, i*4);
			if(recompute_coords)
			{
				var iG = (animated_texture ? ((loop_animation?time:f)*grid_frames)<<0 : p.id) % grid_frames;
				offset_u = iG * d_uvs;
				offset_v = 1 - (offset_u<<0) * d_uvs - d_uvs;
				offset_u = offset_u%1;
				coords[i*2] = offset_u;
				coords[i*2+1] = offset_v;
			}
			extra2[i*2] = s;
			extra2[i*2+1] = i;
			++i;
			if(i*3 >= max_vertices)
				break; //too many particles
			continue;
		}

		s *= particle_size;

		vec3.scale(s_bottomleft, bottomleft, s)
		vec3.scale(s_topright, topright, s);
		vec3.scale(s_topleft, topleft, s);
		vec3.scale(s_bottomright, bottomright, s);

		if(p.angle != 0)
		{
			quat.setAxisAngle( rot , front, p.angle * DEG2RAD);
			vec3.transformQuat(s_bottomleft, s_bottomleft, rot);
			vec3.transformQuat(s_topright, s_topright, rot);
			vec3.transformQuat(s_topleft, s_topleft, rot);
			vec3.transformQuat(s_bottomright, s_bottomright, rot);
		}

		vec3.add(temp, p._pos, s_topright);
		vertices.set(temp, i*6*3);

		vec3.add(temp, p._pos, s_topleft);
		vertices.set(temp, i*6*3 + 3);

		vec3.add(temp, p._pos, s_bottomright);
		vertices.set(temp, i*6*3 + 3*2);

		vec3.add(temp, p._pos, s_topleft);
		vertices.set(temp, i*6*3 + 3*3);

		vec3.add(temp, p._pos, s_bottomleft);
		vertices.set(temp, i*6*3 + 3*4);

		vec3.add(temp, p._pos, s_bottomright);
		vertices.set(temp, i*6*3 + 3*5);

		if(recompute_colors)
		{
			colors.set(color, i*6*4);
			colors.set(color, i*6*4 + 4);
			colors.set(color, i*6*4 + 4*2);
			colors.set(color, i*6*4 + 4*3);
			colors.set(color, i*6*4 + 4*4);
			colors.set(color, i*6*4 + 4*5);
		}

		if(recompute_coords)
		{
			var iG = (animated_texture ? ((loop_animation?time:f)*grid_frames)<<0 : p.id) % grid_frames;
			offset_u = iG * d_uvs;
			offset_v = 1 - (offset_u<<0) * d_uvs - d_uvs;
			offset_u = offset_u%1;
			coords.set([offset_u+d_uvs,offset_v+d_uvs, offset_u,offset_v+d_uvs, offset_u+d_uvs,offset_v,  offset_u,offset_v+d_uvs, offset_u,offset_v, offset_u+d_uvs,offset_v], i*6*2);
		}

		++i;
		if(i*6*3 >= max_vertices)
			break; //too many particles
	}
	this._visible_particles = i;

	//upload geometry
	this._mesh.vertexBuffers["vertices"].data = this._vertices;
	this._mesh.vertexBuffers["vertices"].upload(gl.STREAM_DRAW);

	this._mesh.vertexBuffers["colors"].data = this._colors;
	this._mesh.vertexBuffers["colors"].upload(gl.STREAM_DRAW);

	this._mesh.vertexBuffers["extra2"].data = this._extra2;
	this._mesh.vertexBuffers["extra2"].upload(gl.STREAM_DRAW);

	if(recompute_coords)
	{
		this._mesh.vertexBuffers["coords"].data = this._coords;
		this._mesh.vertexBuffers["coords"].upload(gl.STREAM_DRAW);
	}
}

ParticleEmissor._identity = mat4.create();

//ParticleEmissor.prototype.getRenderInstance = function(options,camera)
ParticleEmissor.prototype.onCollectInstances = function(e, instances, options)
{
	if(!this._root || !this.enabled)
		return;

	var camera = LS.Renderer._current_camera;

	if(!this._material)
		this._material = new Material({ shader_name:"lowglobal" });

	this._material.opacity = this.opacity - 0.01; //try to keep it under 1
	this._material.setTexture(Material.COLOR, this.texture);
	this._material.blend_mode = this.additive_blending ? Blend.ADD : Blend.ALPHA;
	this._material.soft_particles = this.soft_particles;
	this._material.constant_diffuse = true;
	this._material.uvs_matrix[0] = this._material.uvs_matrix[4] = 1 / this.texture_grid_size;

	if(!this._mesh)
		return null;

	var RI = this._render_instance;
	if(!RI)
		this._render_instance = RI = new LS.RenderInstance(this._root, this);

	if(this.follow_emitter)
		mat4.translate( RI.matrix, ParticleEmissor._identity, this._root.transform._position );
	else
		mat4.copy( RI.matrix, ParticleEmissor._identity );

	var material = (this._root.material && this.use_node_material) ? this._root.getMaterial() : this._material;
	mat4.multiplyVec3(RI.center, RI.matrix, vec3.create());

	RI.flags = RI_DEFAULT_FLAGS | RI_IGNORE_FRUSTUM;
	RI.applyNodeFlags();

	RI.setMaterial( material );

	if(this.point_particles)
	{
		RI.setMesh( this._mesh, gl.POINTS );
		RI.uniforms.u_point_size = this.particle_size;
		RI.query.macros["USE_POINTS"] = "";
		RI.query.macros["USE_POINT_CLOUD"] = "";
		RI.query.macros["USE_TEXTURED_POINTS"] = "";
		RI.setRange(0, this._visible_particles);
	}
	else
	{
		RI.setMesh( this._mesh, gl.TRIANGLES );
		RI.setRange(0, this._visible_particles * 6); //6 vertex per particle
		delete RI.query.macros["USE_POINTS"];
		delete RI.query.macros["USE_POINT_CLOUD"];
		delete RI.query.macros["USE_TEXTURED_POINTS"];
		delete RI.uniforms["u_point_size"];
	}

	instances.push( RI );
}

LS.Particle = Particle;
LS.registerComponent(ParticleEmissor);

function Label(o)
{
	this.text = "";
	this.className = "";
	this.use_html = false;
	this._world_pos = vec3.create();
	this._screen_pos = vec3.create();
	this.configure(o);
}

Label.icon = "mini-icon-text.png";
Label.CSS_classname = "LS3D_label";

Label.prototype.onAddedToScene = function( scene )
{
	//events
	LEvent.bind( scene,"renderGUI",this.render,this);
}

Label.prototype.onRemovedFromScene = function(scene)
{
	LEvent.unbind( scene, "renderGUI", this.render, this);
	this.removeHTML();
}

Label.prototype.createHTML = function()
{
	//create html
	var elem = document.createElement("div");
	elem.innerHTML = this.text;
	var style = elem.style;
	style.className = this.constructor.CSS_classname;
	style.position = "absolute";
	style.top = 0;
	style.left = 0;
	style.fontSize = "20px";
	style.padding = "10px";
	style.color = "white";
	style.minWidth = "100px";
	style.pointerEvents = "none";
	style.backgroundColor = "rgba(0,0,0,0.5)";
	style.borderRadius = "2px";

	var parent = LS.getGUIElement();
	parent.appendChild( elem );

	this._element = elem;
}

Label.prototype.removeHTML = function()
{
	if(!this._element)
		return;
	if(this._element.parentNode)
		this._element.parentNode.removeChild( this._element );
	this._element = null;
}

Label.prototype.render = function(e, render_settings)
{
	var node = this._root;

	var camera = LS.Renderer._main_camera;
	if(!camera)
		return;

	node.transform.getGlobalPosition(this._world_pos);
	camera.project(this._world_pos, null, this._screen_pos );

	if(this.use_html)
	{
		if(!this._element)
			this.createHTML();

		if(this._element.innerHTML != this.text)
			this._element.innerHTML = this.text;

		this._element.style.display = node.flags.visible === false ? "none" : "block";
		if(!this.text)
		{
			this._element.style.display = "none";
			return;
		}

		var classname = this.constructor.CSS_classname + " " + this.className;
		if(this._element.className != classname)
			this._element.className = classname;

		this._element.style.left = this._screen_pos[0].toFixed(0) + "px";
		this._element.style.top = (gl.canvas.height - (this._screen_pos[1]|0) - 10) + "px";
	}
	else
	{
		if(this._element)
			this.removeHTML();

		if(gl.start2D)
		{
			var x = this._screen_pos[0] + 5;
			var y = gl.canvas.height - this._screen_pos[1] + 10;
			gl.start2D();
			gl.font = "20px Arial";
			var info = gl.measureText( this.text );
			gl.fillStyle = "black";
			gl.globalAlpha = 0.5;
			gl.fillRect( x - 5, y - 20, info.width + 10, 26 );
			gl.globalAlpha = 1;
			gl.fillStyle = "white";
			gl.fillText( this.text, x, y );
			gl.finish2D();
		}
	}
}

LS.registerComponent(Label);


/* pointCloud.js */

function PointCloud(o)
{
	this.enabled = true;
	this.max_points = 1024;
	this.mesh = null; //use a mesh
	this._points = [];

	this.size = 1;
	this.texture_grid_size = 1;

	//material
	this.texture = null;
	this.global_opacity = 1;
	this.color = vec3.fromValues(1,1,1);
	this.additive_blending = false;

	this.use_node_material = false; 
	this.premultiplied_alpha = false;
	this.in_world_coordinates = false;
	this.sort_in_z = false; //slower

	this.serialize_points = true; //disable if the points shouldnt be stored (if they are generated by another component on runtime)

	if(o)
		this.configure(o);

	this._last_id = 0;

	//debug
	/*
	for(var i = 0; i < 100; i++)
	{
		var pos = vec3.create();
		vec3.random( pos );
		vec3.scale( pos, pos, 50 * Math.random() );
		this.addPoint( pos, [Math.random(),1,1,1], 1 + Math.random() * 2);
	}
	*/

	this.createMesh();
}
PointCloud.icon = "mini-icon-points.png";
PointCloud["@texture"] = { widget: "texture" };
PointCloud["@color"] = { widget: "color" };
PointCloud["@num_points"] = { widget: "info" };
PointCloud["@size"] = { type: "number", step: 0.001 };

PointCloud.default_color = vec4.fromValues(1,1,1,1);

Object.defineProperty( PointCloud.prototype, "num_points", {
	set: function(v) {},
	get: function() { return this._points.length; },
	enumerable: true
});

PointCloud.prototype.addPoint = function( position, color, size, frame_id )
{
	var data = new Float32Array(3+4+2+1); //+1 extra por distance
	data.set(position,0);
	if(color)
		data.set(color,3);
	else
		data.set( PointCloud.default_color, 3 );
	if(size !== undefined)
		data[7] = size;
	else
		data[7] = 1;
	if(frame_id != undefined )
		data[8] = frame_id;
	else
		data[8] = 0;

	this._points.push( data );
	this._dirty = true;

	return this._points.length - 1;
}

PointCloud.prototype.clear = function()
{
	this._points.length = 0;
}

PointCloud.prototype.reset = PointCloud.prototype.clear;

PointCloud.prototype.setPoint = function(id, position, color, size, frame_id )
{
	var data = this._points[id];
	if(!data) return;

	if(position)
		data.set(position,0);
	if(color)
		data.set(color,3);
	if(size !== undefined )
		data[7] = size;
	if(frame_id !== undefined )
		data[8] = frame_id;

	this._dirty = true;
}

PointCloud.prototype.setPointsFromMesh = function( mesh )
{
	//TODO
}


PointCloud.prototype.removePoint = function(id)
{
	this._points.splice(id,1);
	this._dirty = true;
}


PointCloud.prototype.onAddedToNode = function(node)
{
	LEvent.bind(node, "collectRenderInstances", this.onCollectInstances, this);
}

PointCloud.prototype.onRemovedFromNode = function(node)
{
	LEvent.unbind(node, "collectRenderInstances", this.onCollectInstances, this);
}

PointCloud.prototype.getResources = function(res)
{
	if(this.mesh) res[ this.emissor_mesh ] = Mesh;
	if(this.texture) res[ this.texture ] = Texture;
}

PointCloud.prototype.onResourceRenamed = function (old_name, new_name, resource)
{
	if(this.mesh == old_name)
		this.mesh = new_name;
	if(this.texture == old_name)
		this.texture = new_name;
}

PointCloud.prototype.createMesh = function ()
{
	if( this._mesh_max_points == this.max_points)
		return;

	this._vertices = new Float32Array(this.max_points * 3); 
	this._colors = new Float32Array(this.max_points * 4);
	this._extra2 = new Float32Array(this.max_points * 2); //size and texture frame

	var default_size = 1;
	for(var i = 0; i < this.max_points; i++)
	{
		this._colors.set( PointCloud.default_color, i*4);
		this._extra2[i*2] = default_size;
		//this._extra2[i*2+1] = 0;
	}

	if(this._mesh)
		this._mesh.deleteBuffers();

	this._mesh = new GL.Mesh();
	this._mesh.addBuffers({ vertices:this._vertices, colors: this._colors, extra2: this._extra2 }, null, gl.STREAM_DRAW);
	this._mesh_max_points = this.max_points;
}

PointCloud.prototype.updateMesh = function ( camera )
{
	if( this._mesh_max_points != this.max_points) 
		this.createMesh();

	var points = this._points;
	if(this.sort_in_z && camera)
	{
		var center = camera.getEye(); 
		var front = camera.getFront();

		points = this._points.concat(); //copy array
		var plane = geo.createPlane(center, front); //compute camera plane
		var den = Math.sqrt(plane[0]*plane[0] + plane[1]*plane[1] + plane[2]*plane[2]); //delta
		for(var i = 0; i < points.length; ++i)
			points[i][9] = Math.abs(vec3.dot(points[i].subarray(0,3),plane) + plane[3])/den;

		points.sort(function(a,b) { return a[9] < b[9] ? 1 : (a[9] > b[9] ? -1 : 0); });
	}

	//update mesh
	var i = 0, f = 0;
	var vertices = this._vertices;
	var colors = this._colors;
	var extra2 = this._extra2;
	var premultiply = this.premultiplied_alpha;

	for(var iPoint = 0; iPoint < points.length; ++iPoint)
	{
		if( iPoint*3 >= vertices.length)
			break; //too many points
		var p = points[iPoint];

		vertices.set(p.subarray(0,3), iPoint * 3);
		var c = p.subarray(3,7);
		if(premultiply)
			vec3.scale(c,c,c[3]);
		colors.set(c, iPoint * 4);
		extra2.set(p.subarray(7,9), iPoint * 2);
	}

	//upload geometry
	this._mesh.vertexBuffers["vertices"].data = vertices;
	this._mesh.vertexBuffers["vertices"].upload();

	this._mesh.vertexBuffers["colors"].data = colors;
	this._mesh.vertexBuffers["colors"].upload();

	this._mesh.vertexBuffers["extra2"].data = extra2;
	this._mesh.vertexBuffers["extra2"].upload();
}

PointCloud._identity = mat4.create();

PointCloud.prototype.onCollectInstances = function(e, instances, options)
{
	if(!this._root) return;

	if(this._points.length == 0 || !this.enabled)
		return;

	var camera = LS.Renderer._current_camera;

	if(this._last_premultiply !== this.premultiplied_alpha )
		this._dirty = true;

	if(this._dirty)
		this.updateMesh( camera );

	if(!this._material)
	{
		this._material = new LS.Material({ shader_name:"lowglobal" });
		this._material.extra_macros = { 
			USE_POINT_CLOUD: "", //for the stream with sizes
			USE_TEXTURED_POINTS: "" //for texturing the points
		};
	}

	var material = this._material;

	material.color.set(this.color);

	if(this.premultiplied_alpha)
		material.opacity = 1.0 - 0.01;
	else
		material.opacity = this.global_opacity - 0.01;
	this._last_premultiply = this.premultiplied_alpha;

	material.setTexture( LS.Material.COLOR, this.texture );
	material.blend_mode = this.additive_blending ? LS.Blend.ADD : LS.Blend.ALPHA;
	material.constant_diffuse = true;

	if(!this._mesh)
		return null;

	var RI = this._render_instance;
	if(!RI)
		this._render_instance = RI = new LS.RenderInstance(this._root, this);

	if(this.in_world_coordinates && this._root.transform )
		RI.matrix.set( this._root.transform._global_matrix );
	else
		mat4.copy( RI.matrix, PointCloud._identity );

	/*
	if(this.follow_emitter)
		mat4.translate( RI.matrix, PointCloud._identity, this._root.transform._position );
	else
		mat4.copy( RI.matrix, PointCloud._identity );
	*/

	var material = (this._root.material && this.use_node_material) ? this._root.getMaterial() : this._material;
	mat4.multiplyVec3(RI.center, RI.matrix, vec3.create());

	RI.flags = RI_DEFAULT_FLAGS | RI_IGNORE_FRUSTUM;
	RI.applyNodeFlags();
	RI.uniforms.u_point_size = this.size;
	//RI.query.macros["USE_POINTS"] = "";


	RI.setMaterial( material );
	RI.setMesh( this._mesh, gl.POINTS );
	var primitives = this._points.length;
	if(primitives > this._vertices.length / 3)
		primitives = this._vertices.length / 3;

	RI.setRange(0, primitives );
	instances.push(RI);
}

PointCloud.prototype.serialize = function()
{
	var o = LS.cloneObject(this);
	if(this.uid) //special case, not enumerable
		o.uid = this.uid;
	if(this.serialize_points)
	{
		var points = Array(this._points.length);
		for(var i = 0; i < this._points.length; i++)
		{
			points[i] = typedArrayToArray( this._points[i] );
		}
		o.points = points;
	}
	return o;
}

PointCloud.prototype.configure = function(o)
{
	if(!o)
		return;
	if(o.uid) 
		this.uid = o.uid;

	if(o.points && o.serialize_points)
	{
		this._points = Array( o.points.length );
		for(var i = 0; i < o.points.length; i++)
			this._points[i] = new Float32Array( o.points[i] );
		o.points = null;
	}
	LS.cloneObject( o, this );
}


LS.registerComponent( PointCloud );
/* lineCloud.js */

function LineCloud(o)
{
	this.enabled = true;
	this.max_lines = 1024;
	this._lines = [];

	//material
	this.global_opacity = 1;
	this.color = vec3.fromValues(1,1,1);
	this.additive_blending = false;

	this.use_node_material = false; 
	this.premultiplied_alpha = false;
	this.in_world_coordinates = false;

	if(o)
		this.configure(o);

	this._last_id = 0;

	this.createMesh();

	/*
	for(var i = 0; i < 2;i++)
	{
		var pos = vec3.random(vec3.create());
		vec3.scale(pos, pos, 100);
		this.addLine( [0,0,0], pos );
	}
	*/

}
LineCloud.icon = "mini-icon-lines.png";
LineCloud["@color"] = { widget: "color" };

Object.defineProperty( LineCloud.prototype, "num_lines", {
	set: function(v) {},
	get: function() { return this._lines.length; },
	enumerable: true
});

LineCloud.prototype.clear = function()
{
	this._lines.length = 0;
}

LineCloud.prototype.reset = LineCloud.prototype.clear;

//Adds a point connect to the last one
LineCloud.prototype.addPoint = function( point, color )
{
	//last
	var start = null;
	var start_color = null;
	if(this._lines.length)
	{
		var last = this._lines[ this._lines.length - 1 ];
		start = new Float32Array( last.subarray(3,6) );
		start_color = new Float32Array( last.subarray(10,14) );
	}
	else
	{
		start = point;
		start_color = color;
	}
	this.addLine( start, point, start_color, color );
}

LineCloud.prototype.addLine = function( start, end, start_color, end_color )
{
	var data = new Float32Array(3+3+4+4);
	data.set(start,0);
	data.set(end,3);

	if(start_color)
		data.set(start_color,6);
	else
		data.set([1,1,1,1],6);

	if(end_color)
		data.set(end_color,10);
	else if(start_color)
		data.set(start_color,10);
	else
		data.set([1,1,1,1],10);

	this._lines.push( data );
	this._dirty = true;

	return this._lines.length - 1;
}

LineCloud.prototype.setLine = function(id, start, end, start_color, end_color )
{
	var data = this._lines[id];

	if(start)
		data.set(start,0);
	if(end)
		data.set(end,3);

	if(start_color)
		data.set(start_color,6);
	if(end_color)
		data.set(end_color,10);

	this._dirty = true;
}

LineCloud.prototype.removeLine = function(id)
{
	this._lines.splice(id,1);
	this._dirty = true;
}


LineCloud.prototype.onAddedToNode = function(node)
{
	LEvent.bind(node, "collectRenderInstances", this.onCollectInstances, this);
}

LineCloud.prototype.onRemovedFromNode = function(node)
{
	LEvent.unbind(node, "collectRenderInstances", this.onCollectInstances, this);
}

LineCloud.prototype.onResourceRenamed = function (old_name, new_name, resource)
{
}

LineCloud.prototype.createMesh = function ()
{
	if( this._mesh_max_lines == this.max_lines) return;

	this._vertices = new Float32Array(this.max_lines * 3 * 2); 
	this._colors = new Float32Array(this.max_lines * 4 * 2);

	this._mesh = new GL.Mesh();
	this._mesh.addBuffers({ vertices:this._vertices, colors: this._colors }, null, gl.STREAM_DRAW);
	this._mesh_max_lines = this.max_lines;
}

LineCloud.prototype.updateMesh = function ()
{
	if( this._mesh_max_lines != this.max_lines)
		this.createMesh();

	//update mesh
	var i = 0, f = 0;
	var vertices = this._vertices;
	var colors = this._colors;

	var lines = this._lines;
	var l = this._lines.length;
	var vl = vertices.length;

	for(var i = 0; i < l; ++i)
	{
		if( i*6 >= vl) break; //too many lines
		var p = lines[i];

		vertices.set(p.subarray(0,6), i * 6);
		colors.set(p.subarray(6,14), i * 8);
	}

	//upload geometry
	this._mesh.vertexBuffers["vertices"].data = vertices;
	this._mesh.vertexBuffers["vertices"].upload();

	this._mesh.vertexBuffers["colors"].data = colors;
	this._mesh.vertexBuffers["colors"].upload();
}

LineCloud._identity = mat4.create();

LineCloud.prototype.onCollectInstances = function(e, instances, options)
{
	if(!this._root) return;

	if(this._lines.length == 0 || !this.enabled)
		return;

	var camera = Renderer._current_camera;

	if(this._dirty)
		this.updateMesh();

	if(!this._material)
	{
		this._material = new Material({ shader_name:"lowglobal" });
	}

	var material = this._material;

	material.color.set(this.color);
	material.opacity = this.global_opacity - 0.01; //try to keep it under 1
	material.blend_mode = this.additive_blending ? Blend.ADD : Blend.ALPHA;
	material.constant_diffuse = true;

	if(!this._mesh)
		return null;

	var RI = this._render_instance;
	if(!RI)
		this._render_instance = RI = new RenderInstance(this._root, this);

	if(this.in_world_coordinates && this._root.transform )
		RI.matrix.set( this._root.transform._global_matrix );
	else
		mat4.copy( RI.matrix, LineCloud._identity );

	var material = (this._root.material && this.use_node_material) ? this._root.getMaterial() : this._material;
	mat4.multiplyVec3(RI.center, RI.matrix, vec3.create());

	RI.flags = RI_DEFAULT_FLAGS | RI_IGNORE_FRUSTUM;
	RI.applyNodeFlags();

	RI.setMaterial( material );
	RI.setMesh( this._mesh, gl.LINES );
	var primitives = this._lines.length * 2;
	if(primitives > this._vertices.length / 3)
		primitives = this._vertices.length / 3;
	RI.setRange(0,primitives);

	instances.push(RI);
}


LS.registerComponent( LineCloud );
/**
* Reads animation tracks from an Animation resource and applies the properties to the objects referenced
* @class PlayAnimation
* @constructor
* @param {String} object to configure from
*/


function PlayAnimation(o)
{
	this.animation = "";
	this.take = "default";
	this.root_node = "@";
	this.playback_speed = 1.0;
	this.mode = PlayAnimation.LOOP;
	this.playing = true;
	this.current_time = 0;
	this._last_time = 0;
	this.range = null;

	this.disabled_tracks = {};

	if(o)
		this.configure(o);
}

PlayAnimation.LOOP = 1;
PlayAnimation.PINGPONG = 2;
PlayAnimation.ONCE = 3;
PlayAnimation.PAUSED = 4;

PlayAnimation.MODES = {"loop":PlayAnimation.LOOP, "pingpong":PlayAnimation.PINGPONG, "once":PlayAnimation.ONCE, "paused":PlayAnimation.PAUSED };

PlayAnimation["@animation"] = { widget: "resource" };
PlayAnimation["@root_node"] = { type: "node" };
PlayAnimation["@mode"] = { type:"enum", values: PlayAnimation.MODES };

PlayAnimation.prototype.configure = function(o)
{
	if(o.play) //LEGACY
		delete o.play;
	if(o.range) 
		this.range = o.range.concat();
	if(o.mode !== undefined) 
		this.mode = o.mode;
	if(o.animation)
		this.animation = o.animation;
	if(o.take)
		this.take = o.take;
	if(o.playback_speed != null)
		this.playback_speed = parseFloat( o.playback_speed );
	if(o.root_node !== undefined)
		this.root_node = o.root_node;
	if(o.playing !== undefined)
		this.playing = o.playing;
}


PlayAnimation.icon = "mini-icon-clock.png";

PlayAnimation.prototype.onAddedToScene = function(scene)
{
	LEvent.bind( scene, "update", this.onUpdate, this);
}


PlayAnimation.prototype.onRemovedFromScene = function(scene)
{
	LEvent.unbind( scene, "update", this.onUpdate, this);
}


PlayAnimation.prototype.getAnimation = function()
{
	if(!this.animation || this.animation[0] == "@") 
		return this._root.scene.animation;
	var anim = LS.ResourcesManager.getResource( this.animation );
	if( anim && anim.constructor === LS.Animation )
		return anim;
	return null;
}

PlayAnimation.prototype.onUpdate = function(e, dt)
{
	var animation = this.getAnimation();
	if(!animation) 
		return;

	if(!this.playing)
		return;

	if( this.mode != PlayAnimation.PAUSED )
		this.current_time += dt * this.playback_speed;

	var take = animation.takes[ this.take ];
	if(!take) 
		return;

	var time = this.current_time;

	var start_time = 0;
	var duration = take.duration;
	var end_time = duration;

	if(this.range)
	{
		start_time = this.range[0];
		end_time = this.range[1];
		duration = end_time - start_time;
	}

	if(time > end_time)
	{
		switch( this.mode )
		{
			case PlayAnimation.ONCE: 
					time = end_time; 
					this.playing = false;
				break;
			case PlayAnimation.LOOP: time = ((this.current_time - start_time) % duration) + start_time; break;
			case PlayAnimation.PINGPONG:
					if( ((time / duration)|0) % 2 == 0 ) //TEST THIS
						time = this.current_time % duration; 
					else
						time = duration - (this.current_time % duration);
					break;
			default: 
					time = end_time; 
				break;
		}
	}
	else if(time < start_time)
		time = start_time;

	var root_node = null;
	if(this.root_node && this._root.scene)
	{
		if(this.root_node == "@")
			root_node = this._root;
		else
			root_node = this._root.scene.getNode( this.root_node );
	}

	take.applyTracks( time, this._last_time, undefined, root_node );
	this._last_time = time; //TODO, add support for pingpong events in tracks

	//take.actionPerSample( this.current_time, this._processSample.bind( this ), { disabled_tracks: this.disabled_tracks } );

	var scene = this._root.scene;
	if(scene)
		scene.refresh();
}


PlayAnimation.prototype.play = function()
{
	this.playing = true;
}

PlayAnimation.prototype.stop = function()
{
	this.playing = false;
}

PlayAnimation.prototype.playRange = function( start, end )
{
	this.playing = true;
	this.current_time = start;
	this.range = [ start, end ];
}


PlayAnimation.prototype._processSample = function(nodename, property, value, options)
{
	var scene = this._root.scene;
	if(!scene)
		return;
	var node = scene.getNode(nodename);
	if(!node) 
		return;
		
	var trans = node.transform;

	switch(property)
	{
		case "translate.X": if(trans) trans.position[0] = value; break;
		case "translate.Y": if(trans) trans.position[1] = value; break;
		case "translate.Z": if(trans) trans.position[2] = value; break;
		//NOT TESTED
		/*
		case "rotateX.ANGLE": if(trans) trans.rotation[0] = value * DEG2RAD; break;
		case "rotateY.ANGLE": if(trans) trans.rotation[1] = value * DEG2RAD; break;
		case "rotateZ.ANGLE": if(trans) trans.rotation[2] = value * DEG2RAD; break;
		*/
		case "matrix": if(trans) trans.fromMatrix(value); break;
		default: break;
	}
	
	if(node.transform)
		node.transform.updateMatrix();
}

PlayAnimation.prototype.getResources = function(res)
{
	if(this.animation)
		res[ this.animation ] = LS.Animation;
}

PlayAnimation.prototype.onResourceRenamed = function (old_name, new_name, resource)
{
	if(this.animation == old_name)
		this.animation = new_name;
}

LS.registerComponent(PlayAnimation);
/**
* Realtime Reflective surface
* @class RealtimeReflector
* @constructor
* @param {String} object to configure from
*/


function RealtimeReflector(o)
{
	this.enabled = true;
	this.texture_size = 512;
	this.brightness_factor = 1.0;
	this.colorclip_factor = 0.0;
	this.clip_offset = 0.5; //to avoid ugly edges near clipping plane
	this.texture_name = "";
	this.use_cubemap = false;
	this.all_cameras = false; //renders the reflection for every active camera (very slow)
	this.blur = 0;
	this.generate_mipmaps = false;
	this.use_mesh_info = false;
	this.offset = vec3.create();
	this.ignore_this_mesh = true;
	this.high_precision = false;
	this.refresh_rate = 1; //in frames
	this.layers = 0xFF;

	this._textures = {};

	if(o)
		this.configure(o);
}

RealtimeReflector.icon = "mini-icon-reflector.png";

RealtimeReflector["@texture_size"] = { type:"enum", values:["viewport",64,128,256,512,1024,2048] };
RealtimeReflector["@layers"] = { type:"layers" };

RealtimeReflector.prototype.onAddedToScene = function(scene)
{
	LEvent.bind( scene,"renderReflections", this.onRenderReflection, this );
	LEvent.bind( scene,"afterCameraEnabled", this.onCameraEnabled, this );
}


RealtimeReflector.prototype.onRemovedFromScene = function(scene)
{
	LEvent.unbindAll( scene, this );
	for(var i in this._textures)
		LS.ResourcesManager.unregisterResource( ":reflection_" + i );
	this._textures = {}; //clear textures
}


RealtimeReflector.prototype.onRenderReflection = function( e, render_settings )
{
	if(!this.enabled || !this._root)
		return;

	var scene = this._root.scene;
	if(!scene)
		return;

	this.refresh_rate = this.refresh_rate << 0;
	if( (scene._frame == 0 || (scene._frame % this.refresh_rate) != 0) && this._rt)
		return;

	var texture_size = parseInt( this.texture_size );
	var texture_width = texture_size;
	var texture_height = texture_size;

	var visible = this._root.flags.visible;
	if(this.ignore_this_mesh)
		this._root.flags.seen_by_reflections = false;

	//add flags
	render_settings.brightness_factor = this.brightness_factor;
	render_settings.colorclip_factor = this.colorclip_factor;
	var old_layers = render_settings.layers;
	render_settings.layers = this.layers;

	var cameras = LS.Renderer._visible_cameras;

	for(var i = 0; i < cameras.length; i++)
	{
		var camera = cameras[i];

		if( isNaN( texture_size ) && this.texture_size == "viewport")
		{
			texture_size = 512; //used in cubemaps
			var viewport = camera.getLocalViewport(null, camera._viewport_in_pixels );
			texture_width = viewport[2];//gl.canvas.width;
			texture_height = viewport[3];//gl.canvas.height;
		}

		if(this.use_cubemap)
			texture_width = texture_height = texture_size;

		var texture_type = this.use_cubemap ? gl.TEXTURE_CUBE_MAP : gl.TEXTURE_2D;
		var type = this.high_precision ? gl.HIGH_PRECISION_FORMAT : gl.UNSIGNED_BYTE;

		var texture = this._textures[ camera.uid ];
		if(!texture || texture.width != texture_width || texture.height != texture_height || texture.type != type || texture.texture_type != texture_type || texture.minFilter != (this.generate_mipmaps ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR) )
		{
			texture = new GL.Texture( texture_width, texture_height, { type: type, texture_type: texture_type, minFilter: this.generate_mipmaps ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR });
			texture.has_mipmaps = this.generate_mipmaps;
			this._textures[ camera.uid ] = texture;
		}

		//compute planes
		var plane_center = this._root.transform.getGlobalPosition();
		var plane_normal = this._root.transform.getTop();
		var cam_eye = camera.getEye();
		var cam_center = camera.getCenter();
		var cam_up = camera.getUp();

		//use the first vertex and normal from a mesh
		if(this.use_mesh_info)
		{
			var mesh = this._root.getMesh();
			if(mesh)
			{
				plane_center = this._root.transform.transformPointGlobal( BBox.getCenter( mesh.bounding ) );
				plane_normal = this._root.transform.transformVectorGlobal( [0,1,0] );
			}
		}

		vec3.add( plane_center, plane_center, this.offset );

		//camera
		var reflected_camera = this._reflected_camera || new LS.Camera();
		this._reflected_camera = reflected_camera;
		reflected_camera.configure( camera.serialize() );

		if( !this.use_cubemap ) //planar reflection
		{
			reflected_camera.fov = camera.fov;
			reflected_camera.aspect = camera.aspect;
			reflected_camera.eye = geo.reflectPointInPlane( cam_eye, plane_center, plane_normal );
			reflected_camera.center = geo.reflectPointInPlane( cam_center, plane_center, plane_normal );
			reflected_camera.up = geo.reflectPointInPlane( cam_up, [0,0,0], plane_normal );
			//reflected_camera.up = cam_up;

			//little offset
			vec3.add(plane_center, plane_center,vec3.scale(vec3.create(), plane_normal, -this.clip_offset));
			var clipping_plane = [plane_normal[0], plane_normal[1], plane_normal[2], vec3.dot(plane_center, plane_normal)  ];
			render_settings.clipping_plane = clipping_plane;
			LS.Renderer.renderInstancesToRT(reflected_camera, texture, render_settings);
		}
		else //spherical reflection
		{
			reflected_camera.eye = plane_center;
			LS.Renderer.renderInstancesToRT( reflected_camera, texture, render_settings );
		}

		if(this.blur)
		{
			var blur_texture = this._textures[ "blur_" + camera.uid ];
			if( blur_texture && ( Texture.compareFormats( texture, blur_texture ) ||  blur_texture.minFilter != texture.minFilter ))
				blur_texture = null; //remove old one
			blur_texture = texture.applyBlur( this.blur, this.blur, 1, blur_texture );
			//this._textures[ "blur_" + camera.uid ] = blur_texture;
			//LS.ResourcesManager.registerResource(":BLUR" + camera.uid, blur_texture);//debug
		}

		if(this.generate_mipmaps && isPowerOfTwo( texture_width ) && isPowerOfTwo( texture_height ) )
		{
			texture.setParameter( gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR );
			gl.generateMipmap(texture.texture_type);
			texture.unbind();
		}

		if(this.texture_name)
			LS.ResourcesManager.registerResource( this.texture_name, texture );
		LS.ResourcesManager.registerResource( ":reflection_" + camera.uid, texture );

		if(!this.all_cameras)
			break;
	}

	//remove flags
	render_settings.clipping_plane = null;
	render_settings.layers = old_layers;
	delete render_settings.brightness_factor;
	delete render_settings.colorclip_factor;

	//make it visible again
	this._root.flags.visible = visible;
}


RealtimeReflector.prototype.onCameraEnabled = function(e, camera)
{
	if(!this.enabled || !this._root)
		return;

	if(!this._root.material)
		return;

	var texture = this._textures[ camera.uid ];
	if(!texture)
		return;
	
	var mat = this._root.getMaterial();
	if(mat)
	{
		var sampler = mat.setTexture( Material.ENVIRONMENT_TEXTURE, ":reflection_" + camera.uid );
		sampler.uvs = Material.COORDS_FLIPPED_SCREEN;
	}
}

LS.registerComponent( RealtimeReflector );

/** Script is the component in charge of executing scripts to control the behaviour of the application.
* Script must be coded in Javascript and they have full access to all the engine, so one script could replace the behaviour of any part of the engine.
* Scripts are executed inside their own context, the context is local to the script so any variable defined in the context that is not attached to the context wont be accessible from other parts of the engine.
* To interact with the engine Scripts must bind callback to events so the callbacks will be called when those events are triggered, however, there are some generic methods that will be called
* @class Script
* @constructor
* @param {Object} object to configure from
*/
function Script(o)
{
	this.enabled = true;
	this._name = "Unnamed";
	this.code = "this.update = function(dt)\n{\n\t//node.scene.refresh();\n}";

	this._script = new LScript();

	this._script.extra_methods = {
		getComponent: (function() { return this; }).bind(this),
		getLocator: function() { return this.getComponent().getLocator() + "/context"; },
		createProperty: LS.Component.prototype.createProperty,
		createAction: LS.Component.prototype.createAction,
		bind: LS.Component.prototype.bind,
		unbind: LS.Component.prototype.unbind,
		unbindAll: LS.Component.prototype.unbindAll
	};

	this._script.onerror = this.onError.bind(this);
	this._script.exported_callbacks = [];//this.constructor.exported_callbacks;
	this._last_error = null;

	if(o)
		this.configure(o);
}

Script.secure_module = false; //this module is not secure (it can execute code)
Script.block_execution = false; //avoid executing code
Script.catch_important_exceptions = true; //catch exception during parsing, otherwise configuration could fail

Script.icon = "mini-icon-script.png";

Script["@code"] = {type:'script'};

Script.exported_callbacks = ["start","update","trigger","sceneRender", "render","afterRender","renderGUI","finish","collectRenderInstances"];
Script.translate_events = {
	"sceneRender": "beforeRender",
	"beforeRender": "sceneRender",
	"render": "renderInstances", 
	"renderInstances": "render",
	"afterRender":"afterRenderInstances", 
	"afterRenderInstances": "afterRender"};

Script.coding_help = "\n\
Global vars:\n\
 + node : represent the node where this component is attached.\n\
 + component : represent the component.\n\
 + this : represents the script context\n\
\n\
Exported functions:\n\
 + start: when the Scene starts\n\
 + update: when updating\n\
 + trigger : if this node is triggered\n\
 + render : before rendering the node\n\
 + getRenderInstances: when collecting instances\n\
 + afterRender : after rendering the node\n\
 + finish : when the scene finished (mostly used for editor stuff)\n\
\n\
Remember, all basic vars attached to this will be exported as global.\n\
";

Script.active_scripts = {};

Object.defineProperty( Script.prototype, "name", {
	set: function(v){ 
		if( LS.Script.active_scripts[ this._name ] )
			delete LS.Script.active_scripts[ this._name ];
		this._name = v;
		if( this._name && !LS.Script.active_scripts[ this._name ] )
			LS.Script.active_scripts[ this._name ] = this;
	},
	get: function() { return this._name; },
	enumerable: true
});

Object.defineProperty( Script.prototype, "context", {
	set: function(v){ 
		console.error("Script: context cannot be assigned");
	},
	get: function() { 
		if(this._script)
				return this._script._context;
		return null;
	},
	enumerable: false //if it was enumerable it would be serialized
});

Script.prototype.configure = function(o)
{
	if(o.uid)
		this.uid = o.uid;
	if(o.enabled !== undefined)
		this.enabled = o.enabled;
	if(o.name !== undefined)
		this.name = o.name;
	if(o.code !== undefined)
		this.code = o.code;
	if(o.properties)
		 this.setContextProperties( o.properties );
}

Script.prototype.serialize = function()
{
	return {
		uid: this.uid,
		enabled: this.enabled,
		name: this.name,
		code: this.code,
		properties: LS.cloneObject( this.getContextProperties() )
	};
}



Script.prototype.getContext = function()
{
	if(this._script)
		return this._script._context;
	return null;
}

Script.prototype.getCode = function()
{
	return this.code;
}

Script.prototype.setCode = function( code, skip_events )
{
	this.code = code;
	this.processCode( skip_events );
}

/**
* This is the method in charge of compiling the code and executing the constructor, which also creates the context.
* It is called everytime the code is modified, that implies that the context is created when the component is configured.
* @method processCode
*/
Script.prototype.processCode = function( skip_events )
{
	this._script.code = this.code;
	if(this._root && !LS.Script.block_execution )
	{
		//unbind old stuff
		if(this._script && this._script._context)
			this._script._context.unbindAll();

		//save old state
		var old = this._stored_properties || this.getContextProperties();

		//compiles and executes the context
		var ret = this._script.compile({component:this, node: this._root, scene: this._root.scene });
		if(!skip_events)
			this.hookEvents();

		this.setContextProperties( old );
		this._stored_properties = null;

		return ret;
	}
	return true;
}

Script.prototype.getContextProperties = function()
{
	var ctx = this.getContext();
	if(!ctx)
		return;
	return LS.cloneObject( ctx );
}

Script.prototype.setContextProperties = function( properties )
{
	if(!properties)
		return;
	var ctx = this.getContext();
	if(!ctx) //maybe the context hasnt been crated yet
	{
		this._stored_properties = properties;
		return;
	}

	LS.cloneObject( properties, ctx, false, true );
}

//used for graphs
Script.prototype.setProperty = function(name, value)
{
	var ctx = this.getContext();

	if( ctx && ctx[name] !== undefined )
	{
		if(ctx[name].set)
			ctx[name](value);
		else
			ctx[name] = value;
	}
	else if(this[name])
		this[name] = value;
}


Script.prototype.getProperties = function()
{
	var ctx = this.getContext();

	if(!ctx)
		return {enabled:"boolean"};

	var attrs = LS.getObjectProperties( ctx );
	attrs.enabled = "boolean";
	return attrs;
}

/*
Script.prototype.getPropertyValue = function( property )
{
	var ctx = this.getContext();
	if(!ctx)
		return;

	return ctx[ property ];
}

Script.prototype.setPropertyValue = function( property, value )
{
	var context = this.getContext();
	if(!context)
		return;

	if( context[ property ] === undefined )
		return;

	if(context[ property ] && context[ property ].set)
		context[ property ].set( value );
	else
		context[ property ] = value;

	return true;
}
*/

//used for animation tracks
Script.prototype.getPropertyInfoFromPath = function( path )
{
	if(path[0] != "context")
		return;

	var context = this.getContext();

	if(path.length == 1)
		return {
			name:"context",
			node: this._root,
			target: context,
			type: "object"
		};

	var varname = path[1];
	if(!context || context[ varname ] === undefined )
		return;

	var value = context[ varname ];
	var extra_info = context[ "@" + varname ];

	var type = "";
	if(extra_info)
		type = extra_info.type;


	if(!type && value !== null && value !== undefined)
	{
		if(value.constructor === String)
			type = "string";
		else if(value.constructor === Boolean)
			type = "boolean";
		else if(value.length)
			type = "vec" + value.length;
		else if(value.constructor === Number)
			type = "number";
	}

	return {
		node: this._root,
		target: context,
		name: varname,
		value: value,
		type: type
	};
}

Script.prototype.setPropertyValueFromPath = function( path, value, offset )
{
	offset = offset || 0;

	if( path.length < (offset+1) )
		return;

	if(path[offset] != "context" )
		return;

	var context = this.getContext();
	var varname = path[offset+1];
	if(!context || context[ varname ] === undefined )
		return;

	if( context[ varname ] === undefined )
		return;

	if(context[ varname ] && context[ varname ].set)
		context[ varname ].set( value );
	else
		context[ varname ] = value;
}

Script.prototype.hookEvents = function()
{
	var hookable = LS.Script.exported_callbacks;
	var root = this._root;
	var scene = root.scene;
	if(!scene)
		scene = LS.GlobalScene; //hack

	//script context
	var context = this.getContext();
	if(!context)
		return;

	//hook events
	for(var i in hookable)
	{
		var name = hookable[i];
		var event_name = LS.Script.translate_events[name] || name;
		var target = event_name == "trigger" ? root : scene; //some events are triggered in the scene, others in the node
		if( context[name] && context[name].constructor === Function )
		{
			if( !LEvent.isBind( target, event_name, this.onScriptEvent, this )  )
				LEvent.bind( target, event_name, this.onScriptEvent, this );
		}
		else
			LEvent.unbind( target, event_name, this.onScriptEvent, this );
	}
}

Script.prototype.onAddedToNode = function( node )
{
	if(!node.script)
		node.script = this;
}

Script.prototype.onRemovedFromNode = function( node )
{
	if(node.script == this)
		delete node.script;
}

Script.prototype.onAddedToScene = function( scene )
{
	if( this._name && !LS.Script.active_scripts[ this._name ] )
		LS.Script.active_scripts[ this._name ] = this;

	if( !this.constructor.catch_important_exceptions )
	{
		this.processCode();
		return;
	}

	//catch
	try
	{
		//careful, if the code saved had an error, do not block the flow of the configure or the rest will be lost
		this.processCode();
	}
	catch (err)
	{
		console.error(err);
	}
}

Script.prototype.onRemovedFromScene = function(scene)
{
	if( this._name && LS.Script.active_scripts[ this._name ] )
		delete LS.Script.active_scripts[ this._name ];

	//ensures no binded events
	if(this._context)
		LEvent.unbindAll( scene, this._context, this );

	//unbind evends
	LEvent.unbindAll( scene, this );
}


//TODO stuff ***************************************
Script.prototype.onAddedToProject = function( project )
{
	try
	{
		//just in case the script saved had an error, do not block the flow
		this.processCode();
	}
	catch (err)
	{
		console.error(err);
	}
}

Script.prototype.onRemovedFromProject = function( project )
{
	//ensures no binded events
	if(this._context)
		LEvent.unbindAll( project, this._context, this );

	//unbind evends
	LEvent.unbindAll( project, this );
}
//*******************************



Script.prototype.onScriptEvent = function(event_type, params)
{
	//this.processCode(true); //¿?

	if(!this.enabled)
		return;

	var method_name = LS.Script.translate_events[ event_type ] || event_type;
	this._script.callMethod( method_name, params );
}

Script.prototype.runStep = function(method, args)
{
	this._script.callMethod(method,args);
}

Script.prototype.onError = function(err)
{
	var scene = this._root.scene;
	if(!scene)
		return;

	LEvent.trigger( this, "code_error",err);
	LEvent.trigger( scene, "code_error",[this,err]);
	LEvent.trigger( Script, "code_error",[this,err]);
	console.log("app finishing due to error in script");
	scene.finish();
}

//called from the editor?
Script.prototype.onCodeChange = function(code)
{
	this.processCode();
}

Script.prototype.getResources = function(res)
{
	var ctx = this.getContext();

	if(!ctx || !ctx.getResources )
		return;
	
	ctx.getResources( res );
}

LS.registerComponent( Script );
LS.Script = Script;

//*****************

function ScriptFromFile(o)
{
	this.enabled = true;
	this._filename = "";

	this._script = new LScript();

	this._script.extra_methods = {
		getComponent: (function() { return this; }).bind(this),
		getLocator: function() { return this.getComponent().getLocator() + "/context"; },
		createProperty: LS.Component.prototype.createProperty,
		createAction: LS.Component.prototype.createAction,
		bind: LS.Component.prototype.bind,
		unbind: LS.Component.prototype.unbind,
		unbindAll: LS.Component.prototype.unbindAll
	};

	this._script.onerror = this.onError.bind(this);
	this._script.exported_callbacks = [];//this.constructor.exported_callbacks;
	this._last_error = null;

	if(o)
		this.configure(o);
}

Object.defineProperty( ScriptFromFile.prototype, "filename", {
	set: function(v){ 
		this._filename = v;
		this.processCode();
	},
	get: function() { 
		return this._filename;
	},
	enumerable: true
});

Object.defineProperty( ScriptFromFile.prototype, "context", {
	set: function(v){ 
		console.error("ScriptFromFile: context cannot be assigned");
	},
	get: function() { 
		if(this._script)
				return this._script._context;
		return null;
	},
	enumerable: false //if it was enumerable it would be serialized
});

ScriptFromFile.prototype.onAddedToScene = function( scene )
{
	if( !this.constructor.catch_important_exceptions )
	{
		this.processCode();
		return;
	}

	//catch
	try
	{
		//careful, if the code saved had an error, do not block the flow of the configure or the rest will be lost
		this.processCode();
	}
	catch (err)
	{
		console.error(err);
	}
}

ScriptFromFile.prototype.processCode = function( skip_events )
{
	var that = this;
	if(!this.filename)
		return;

	var script_resource = LS.ResourcesManager.getResource( this.filename );
	if(!script_resource)
	{
		LS.ResourcesManager.load( this.filename, null, function( res, url ){
			if( url != that.filename )
				return;
			that.processCode( skip_events );
		});
		return;
	}

	var code = script_resource.data;
	if( code === undefined || this._script.code == code )
		return;

	if(this._root && !LS.Script.block_execution )
	{
		//assigned inside because otherwise if it gets modified before it is attached to the scene tree then it wont be compiled
		this._script.code = code;

		//unbind old stuff
		if( this._script && this._script._context )
			this._script._context.unbindAll();

		//compiles and executes the context
		var old = this._stored_properties || this.getContextProperties();
		var ret = this._script.compile({component:this, node: this._root, scene: this._root.scene });
		if(!skip_events)
			this.hookEvents();
		this.setContextProperties( old );
		this._stored_properties = null;
		return ret;
	}
	return true;
}

ScriptFromFile.prototype.configure = function(o)
{
	if(o.uid)
		this.uid = o.uid;
	if(o.enabled !== undefined)
		this.enabled = o.enabled;
	if(o.filename !== undefined)
		this.filename = o.filename;
	if(o.properties)
		 this.setContextProperties( o.properties );
}

ScriptFromFile.prototype.serialize = function()
{
	return {
		uid: this.uid,
		enabled: this.enabled,
		filename: this.filename,
		properties: LS.cloneObject( this.getContextProperties() )
	};
}


ScriptFromFile.prototype.getResources = function(res)
{
	if(this.filename)
		res[this.filename] = LS.Resource;

	//script resources
	var ctx = this.getContext();
	if(!ctx || !ctx.getResources )
		return;
	ctx.getResources( res );
}

ScriptFromFile.prototype.getCode = function()
{
	var script_resource = LS.ResourcesManager.getResource( this.filename );
	if(!script_resource)
		return "";
	return script_resource.data;
}

ScriptFromFile.prototype.setCode = function( code, skip_events )
{
	var script_resource = LS.ResourcesManager.getResource( this.filename );
	if(!script_resource)
		return "";
	script_resource.data = code;
	this.processCode( skip_events );
}

ScriptFromFile.updateComponents = function( script, skip_events )
{
	if(!script)
		return;
	var filename = script.filename;
	var components = LS.GlobalScene.findNodeComponents( LS.ScriptFromFile );
	for(var i = 0; i < components.length; ++i)
	{
		var compo = components[i];
		var filename = script.fullpath || script.filename;
		if( compo.filename == filename )
			compo.processCode(skip_events);
	}
}

LS.extendClass( ScriptFromFile, Script );

LS.registerComponent( ScriptFromFile );
LS.ScriptFromFile = ScriptFromFile;


function TerrainRenderer(o)
{
	this.height = 2;
	this.size = 10;

	this.subdivisions = 100;
	this.heightmap = "";
	this._primitive = -1;
	this.auto_update = true;
	this.action = "Update"; //button


	this._mesh = null;

	if(o)
		this.configure(o);
}

Object.defineProperty( TerrainRenderer.prototype, 'primitive', {
	get: function() { return this._primitive; },
	set: function(v) { 
		v = (v === undefined || v === null ? -1 : v|0);
		if(v != -1 && v != 0 && v!= 1 && v!= 4 && v!= 10)
			return;
		this._primitive = v;
	},
	enumerable: true
});

TerrainRenderer.icon = "mini-icon-terrain.png";

TerrainRenderer["@subdivisions"] = { type: "number", min:1,max:255,step:1 };
TerrainRenderer["@heightmap"] = { type: "texture" };
TerrainRenderer["@action"] = { widget: "button", callback: function() { 
	if(this.options.instance)
		this.options.instance.updateMesh();
}};
TerrainRenderer["@primitive"] = {type:"enum", values: {"Default":null, "Points": 0, "Lines":1, "Triangles":4, "Wireframe":10 }};


TerrainRenderer.prototype.onAddedToNode = function(node)
{
	LEvent.bind(node, "collectRenderInstances", this.onCollectInstances, this);
}

TerrainRenderer.prototype.onRemovedFromNode = function(node)
{
	LEvent.unbind(node, "collectRenderInstances", this.onCollectInstances, this);
	if(this._root.mesh == this._mesh)
		delete this._root["mesh"];
}

TerrainRenderer.prototype.getResources = function(res)
{
	if(this.heightmap)
		res[ this.heightmap ] = Texture;
}

TerrainRenderer.prototype.onResourceRenamed = function (old_name, new_name, resource)
{
	if(this.heightmap == old_name)
		this.heightmap = new_name;
}

TerrainRenderer.prototype.updateMesh = function()
{
	//console.log("updating terrain mesh...");

	//check that we have all the data
	if(!this.heightmap) 
		return;

	var heightmap = LS.ResourcesManager.textures[ this.heightmap ];
	if(!heightmap) 
		return;

	var img = heightmap.img;
	if(!img) 
		return;

	if(this.subdivisions > img.width)
		this.subdivisions = img.width;
	if(this.subdivisions > img.height)
		this.subdivisions = img.height;

	if(this.subdivisions > 255 && !gl.extensions.OES_element_index_uint )
		this.subdivisions = 255; //MAX because of indexed nature

	//optimize it
	var hsize = this.size * 0.5;
	var subdivisions = (this.subdivisions)<<0;
	var height = this.height;

	//get the pixels
	var canvas = createCanvas(subdivisions,subdivisions);
	var ctx = canvas.getContext("2d");
	ctx.drawImage(img,0,0,img.width,img.height,0,0,canvas.width, canvas.height);
	//$("body").append(canvas);

	var pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
	var data = pixels.data;

	//create the mesh
	var triangles = [];
	var wireframe = [];
	var vertices = [];
	var normals = [];
	var coords = [];

	var detailX, detailY;
	detailY = detailX = subdivisions-1;
	var h,lh,th,rh,bh = 0;

	var yScale = height;
	var xzScale = hsize / (subdivisions-1);

	for (var y = 0; y <= detailY; y++) 
	{
		var t = y / detailY;
		for (var x = 0; x <= detailX; x++) 
		{
			var s = x / detailX;

			h = data[y * subdivisions * 4 + x * 4] / 255; //red channel
			vertices.push(hsize*(2 * s - 1), h * height, hsize*(2 * t - 1));
			coords.push(s,1-t);

			if(x == 0 || y == 0 || x == detailX-1 || y == detailY-1)
				normals.push(0, 1, 0);
			else
			{
				var sX = (data[y * subdivisions * 4 + (x+1) * 4] / 255) - (data[y * subdivisions * 4 + (x-1) * 4] / 255);
				var sY = (data[(y+1) * subdivisions * 4 + x * 4] / 255) - (data[(y-1) * subdivisions * 4 + x * 4] / 255);
				var N = [-sX*yScale,2*xzScale,-sY*yScale];
				vec3.normalize(N,N);
				normals.push(N[0],N[1],N[2]);
			}

			//add triangle
			if (x < detailX && y < detailY)
			{
				var i = x + y * (detailX + 1);
				triangles.push(i+1, i, i + detailX + 1);
				triangles.push(i + 1, i + detailX + 1, i + detailX + 2);
				wireframe.push(i+1, i, i, i + detailX + 1 );
			}
		}
	}

	var mesh = new GL.Mesh({vertices:vertices,normals:normals,coords:coords},{triangles:triangles, wireframe: wireframe});
	mesh.setBounding( [0,this.height*0.5,0], [hsize,this.height*0.5,hsize] );
	this._mesh = mesh;
	this._info = [ this.heightmap, this.size, this.height, this.subdivisions, this.smooth ];
}

TerrainRenderer.PLANE = null;

TerrainRenderer.prototype.onCollectInstances = function(e, instances)
{
	if(!this._mesh && this.heightmap)
		this.updateMesh();

	if(this.auto_update && this._info)
	{
		if( this._info[0] != this.heightmap || this._info[1] != this.size || this._info[2] != this.height || this._info[3] != this.subdivisions || this._info[4] != this.smooth )
			this.updateMesh();
	}

	var RI = this._render_instance;
	if(!RI)
		this._render_instance = RI = new RenderInstance(this._root, this);

	if(!this._mesh)
	{
		if(!TerrainRenderer.PLANE)
			TerrainRenderer.PLANE = GL.Mesh.plane({xz:true,normals:true,coords:true});	
		RI.mesh = TerrainRenderer.PLANE;
		return RI;
	};

	RI.material = this._root.getMaterial();
	RI.setMesh( this._mesh, this.primitive );
	
	this._root.mesh = this._mesh;
	this._root.transform.getGlobalMatrix( RI.matrix );
	mat4.multiplyVec3(RI.center, RI.matrix, vec3.create());

	RI.flags = RI_DEFAULT_FLAGS;
	RI.applyNodeFlags();
	
	instances.push(RI);
}

LS.registerComponent(TerrainRenderer);


function Cloner(o)
{
	this.enabled = true;

	this.createProperty( "count", vec3.fromValues(10,1,1) );
	this.createProperty( "size", vec3.fromValues(100,100,100) );

	this.mesh = null;
	this.lod_mesh = null;
	this.material = null;
	this.mode = Cloner.GRID_MODE;

	if(o)
		this.configure(o);

	if(!Cloner._identity) //used to avoir garbage
		Cloner._identity = mat4.create();
}

Cloner.GRID_MODE = 1;
Cloner.RADIAL_MODE = 2;
Cloner.MESH_MODE = 3;

Cloner.icon = "mini-icon-cloner.png";

//vars
Cloner["@mesh"] = { type: "mesh" };
Cloner["@lod_mesh"] = { type: "mesh" };
Cloner["@mode"] = { type:"enum", values: { "Grid": Cloner.GRID_MODE, "Radial": Cloner.RADIAL_MODE, "Mesh": Cloner.MESH_MODE } };
Cloner["@count"] = { type:"vec3", min:1, step:1 };

Cloner.prototype.onAddedToScene = function(scene)
{
	LEvent.bind(scene, "collectRenderInstances", this.onCollectInstances, this);
	LEvent.bind(scene, "afterCollectData", this.onUpdateInstances, this);
}


Cloner.prototype.onRemovedFromScene = function(scene)
{
	LEvent.unbind(scene, "collectRenderInstances", this.onCollectInstances, this);
	LEvent.unbind(scene, "afterCollectData", this.onUpdateInstances, this);
}

Cloner.prototype.getMesh = function() {
	if(typeof(this.mesh) === "string")
		return ResourcesManager.meshes[this.mesh];
	return this.mesh;
}

Cloner.prototype.getLODMesh = function() {
	if(typeof(this.lod_mesh) === "string")
		return ResourcesManager.meshes[this.lod_mesh];
	return this.low_mesh;
}

Cloner.prototype.getResources = function(res)
{
	if(typeof(this.mesh) == "string")
		res[this.mesh] = Mesh;
	if(typeof(this.lod_mesh) == "string")
		res[this.lod_mesh] = Mesh;
	return res;
}

Cloner.generateTransformKey = function(count, hsize, offset)
{
	var key = new Float32Array(9);
	key.set(count);
	key.set(hsize,3);
	key.set(offset,6);
	return key;
}

Cloner.compareKeys = function(a,b)
{
	for(var i = 0; i < a.length; ++i)
		if(a[i] != b[i])
			return false;
	return true;
}


Cloner.prototype.onCollectInstances = function(e, instances)
{
	if(!this.enabled)
		return;

	var mesh = this.getMesh();
	if(!mesh) 
		return null;

	var node = this._root;
	if(!this._root)
		return;

	this.updateRenderInstancesArray();

	var RIs = this._RIs;
	var material = this.material || this._root.getMaterial();
	var flags = 0;

	//resize the instances array to fit the new RIs (avoids using push)
	var start_array_pos = instances.length;
	instances.length = start_array_pos + RIs.length;

	//update parameters
	for(var i = 0, l = RIs.length; i < l; ++i)
	{
		var RI = RIs[i];
		//genereate flags for the first instance
		if(i == 0)
		{
			RI.flags = RI_DEFAULT_FLAGS | RI_IGNORE_AUTOUPDATE;
			RI.applyNodeFlags();
			flags = RI.flags;
		}
		else //for the rest just reuse the same as the first one
			RI.flags = flags;

		RI.setMesh(mesh);
		if(this.lod_mesh)
		{
			var lod_mesh = this.getLODMesh();
			if(lod_mesh)
				RI.setLODMesh( lod_mesh );
		}
		RI.setMaterial( material );
		instances[start_array_pos + i] = RI;
	}
}

Cloner.prototype.updateRenderInstancesArray = function()
{
	var total = 0;
	if(this.mode === Cloner.GRID_MODE)
		total = (this.count[0]|0) * (this.count[1]|0) * (this.count[2]|0);
	else if(this.mode === Cloner.RADIAL_MODE)
		total = this.count[0]|0;
	else if(this.mode === Cloner.MESH_MODE)
	{
		total = 0; //TODO
	}


	if(!total) 
	{
		this._RIs.length = 0;
		return;
	}

	if(!this._RIs || this._RIs.length != total)
	{
		//create RIs
		if(!this._RIs)
			this._RIs = new Array(total);
		else
			this._RIs.length = total;

		for(var i = 0; i < total; ++i)
			if(!this._RIs[i])
				this._RIs[i] = new LS.RenderInstance(this._root, this);
	}
}

Cloner.prototype.onUpdateInstances = function(e, dt)
{
	if(!this.enabled)
		return;

	var RIs = this._RIs;
	if(!RIs || !RIs.length)
		return;

	var global = this._root.transform.getGlobalMatrix(mat4.create());

	var countx = this._count[0]|0;
	var county = this._count[1]|0;
	var countz = this._count[2]|0;

	//Set position according to the cloner mode
	if(this.mode == Cloner.GRID_MODE)
	{
		//compute offsets
		var hsize = vec3.scale( vec3.create(), this.size, 0.5 );
		var offset = vec3.create();
		if( countx > 1) offset[0] = this.size[0] / ( countx - 1);
		else hsize[0] = 0;
		if( county > 1) offset[1] = this.size[1] / ( county - 1);
		else hsize[1] = 0;
		if( countz > 1) offset[2] = this.size[2] / ( countz - 1);
		else hsize[2] = 0;

		var i = 0;
		var tmp = vec3.create(), zero = vec3.create();
		for(var x = 0; x < countx; ++x)
		for(var y = 0; y < county; ++y)
		for(var z = 0; z < countz; ++z)
		{
			var RI = RIs[i];
			if(!RI)
				return;
			tmp[0] = x * offset[0] - hsize[0];
			tmp[1] = y * offset[1] - hsize[1];
			tmp[2] = z * offset[2] - hsize[2];
			mat4.translate( RI.matrix, global, tmp );
			mat4.multiplyVec3( RI.center, RI.matrix, zero );
			++i;
		}
	}
	else if(this.mode == Cloner.RADIAL_MODE)
	{
		var offset = Math.PI * 2 / RIs.length;
		var tmp = vec3.create(), zero = vec3.create();
		for(var i = 0, l = RIs.length; i < l; ++i)
		{
			var RI = RIs[i];
			if(!RI)
				return;

			tmp[0] = Math.sin( offset * i ) * this.size[0];
			tmp[1] = 0;
			tmp[2] = Math.cos( offset * i ) * this.size[0];
			RI.matrix.set( global );
			mat4.translate( RI.matrix, RI.matrix, tmp );
			mat4.rotateY( RI.matrix,RI.matrix, offset * i );
			mat4.multiplyVec3( RI.center, RI.matrix, zero );
		}
	}
}



LS.registerComponent(Cloner);
/**
* Spherize deforms a mesh, it is an example of a deformer, a component that modifies the meshes of one node
* @class Spherize
* @constructor
* @param {String} object to configure from
*/

function Spherize(o)
{
	this.enabled = true;
	this._num_id = LS._last_uid++;
	this.radius = 10;
	this.center = vec3.create();
	this.factor = 0.5;

	this._uniforms_code = Spherize._uniforms_code.replaceAll({"@": this._num_id});
	this._code = Spherize._code.replaceAll({"@": this._num_id});
	
	if(o)
		this.configure(o);
}

Spherize["@factor"] = { type: "number", step: 0.001 };
Spherize["@center"] = { type: "position", step: 0.001 };

Spherize.icon = "mini-icon-circle.png";

Spherize.prototype.onAddedToNode = function( node )
{
	LEvent.bind( node, "computingShaderQuery", this.onShaderQuery, this);
	LEvent.bind( node, "computingShaderUniforms", this.onUniforms, this);
}


Spherize.prototype.onRemovedFromNode = function(node)
{
	LEvent.unbindAll(node,this);
}

Spherize._uniforms_code = "uniform vec3 u_spherize_center@; uniform float u_spherize_radius@; uniform float u_spherize_factor@;";
Spherize._code = "\
	vec3 off@ = vertex4.xyz - u_spherize_center@;\
    float dist@ = length(off@);\
	vec3 vn@ = off@ / dist@;\
	float factor@ = max(0.0, u_spherize_factor@ / dist@ );\
	vertex4.xyz = mix(vertex4.xyz, vn@ * u_spherize_radius@, factor@);\
	v_normal = (mix(v_normal, vn@, clamp(0.0,1.0,factor@)));\
";

Spherize.prototype.onShaderQuery = function(e, query)
{
	if(!this.enabled)
		return;

	if(query.macros.USE_VERTEX_SHADER_UNIFORMS)
		query.macros.USE_VERTEX_SHADER_UNIFORMS += this._uniforms_code;
	else
		query.macros.USE_VERTEX_SHADER_UNIFORMS = this._uniforms_code;

	if(query.macros.USE_VERTEX_SHADER_CODE)
		query.macros.USE_VERTEX_SHADER_CODE += this._code;
	else
		query.macros.USE_VERTEX_SHADER_CODE = this._code;
}

Spherize.prototype.onUniforms = function(e, uniforms)
{
	if(!this.enabled)
		return;

	uniforms["u_spherize_center" + this._num_id ] = this.center;
	uniforms["u_spherize_radius" + this._num_id ] = this.radius;
	uniforms["u_spherize_factor" + this._num_id ] = this.factor;
}

Spherize.prototype.renderEditor = function(node_selected, component_selected)
{
	if(!this.enabled)
		return;

	//if node is selected, render frustrum
	if (node_selected && this.enabled)
	{
		Draw.setPointSize(6);
		Draw.setColor([0.33,0.874,0.56, component_selected ? 0.8 : 0.5 ]);
		var pos = vec3.clone(this.center);
		if(this._root && this._root.transform)
			vec3.transformMat4( pos, pos, this._root.transform._global_matrix );
		Draw.renderRoundPoints( pos );
	}
}

//Mostly used for gizmos
Spherize.prototype.getTransformMatrix = function( element )
{
	if( !this._root || !this._root.transform )
		return null; //use the node transform

	var p = null;
	if (element == "center")
		p = this.center;
	else
		return false;

	var T = mat4.clone( this._root.transform._global_matrix );
	mat4.translate( T, T, p );
	return T;
}

Spherize.prototype.renderPicking = function(ray)
{
	var pos = vec3.clone(this.center);
	if(this._root && this._root.transform)
		vec3.transformMat4( pos, pos, this._root.transform._global_matrix );
	EditorView.addPickingPoint( pos, 4, { instance: this, info: "center" } );
}

Spherize.prototype.applyTransformMatrix = function( matrix, center, element )
{
	if( !this._root || !this._root.transform )
		return false; //ignore transform

	if (element != "center")
		return false;

	var p = this.center;
	mat4.multiplyVec3( p, matrix, p );
	return true;
}

LS.registerComponent( Spherize );
//WORK IN PROGRESS: NOT FINISHED

/**
* This component allow to integrate with WebVR to use VR Headset
* @class VRCameraController
* @namespace LS.Components
* @param {Object} o object with the serialized info
*/
function VRCameraController(o)
{
	this.enabled = true;
	this.eye_distance = 1;
	if(o)
		this.configure(o);
}

VRCameraController.icon = "mini-icon-graph.png";

//Remove this
VRCameraController.rift_server_url = "http://tamats.com/uploads/RiftServer_0_3.zip";

VRCameraController.prototype.onAddedToNode = function(node)
{
	var scene = node.scene;

	LEvent.bind(scene,"start", this.onStart, this );
	LEvent.bind(scene,"finish", this.onStop, this );
	LEvent.bind(scene,"beforeRender", this.onBeforeRender, this );
	LEvent.bind(scene,"afterRender", this.onAfterRender, this );
	LEvent.bind(node, "collectCameras", this.onCollectCameras, this );
}

VRCameraController.prototype.onRemovedFromNode = function(node)
{
	var scene = this._root.scene;

	LEvent.unbind(scene,"start", this.onStart, this );
	LEvent.unbind(scene,"finish", this.onStop, this );
	LEvent.unbind(scene,"beforeRender", this.onBeforeRender, this );
	LEvent.unbind(scene,"afterRender", this.onAfterRender, this );
	LEvent.unbind(node, "collectCameras", this.onCollectCameras, this );
	Renderer.color_rendertarget = null;
}

VRCameraController.prototype.onCollectCameras = function(e, cameras)
{
	var main_camera = Renderer.main_camera;

	if(this._orientation)
		main_camera.setOrientation(this._orientation, true);

	var right_vector = main_camera.getLocalVector([ this.eye_distance * 0.5, 0, 0]);
	var left_vector = vec3.scale( vec3.create(), right_vector, -1);

	if(!this._left_camera)
	{
		this._left_camera = new LS.Camera();
		this._right_camera = new LS.Camera();
	}

	var main_info = main_camera.serialize();

	this._left_camera.configure(main_info);
	this._right_camera.configure(main_info);

	this._left_camera.eye = vec3.add(vec3.create(), main_camera.eye, left_vector);
	this._right_camera.eye = vec3.add(vec3.create(), main_camera.eye, right_vector);

	this._left_camera._viewport.set([0,0,0.5,1]);
	this._right_camera._viewport.set([0.5,0,0.5,1]);
	this._right_camera._ignore_clear = true;

	cameras.push( this._left_camera, this._right_camera );
}

VRCameraController.prototype.onStart = function(e)
{
	var ws = new WebSocket("ws://localhost:1981");
	ws.onopen = function()
	{
		console.log("VR connection stablished");
	}

	ws.onmessage = this.onMessage.bind(this);

	ws.onclose = function()
	{
		console.log("OVR connection lost");
	}

	ws.onerror = function()
	{
		console.error("Oculus Server not found in your machine. To run an app using Oculus Rift you need to use a client side app, you can download it from: " + OculusController.rift_server_url );
	}

	this._ws = ws;
}

VRCameraController.prototype.onMessage = function(e)
{
	var data = e.data;
	data = JSON.parse("[" + data + "]");

	var q = quat.create();
	q.set( data );
	var q2 = quat.fromValues(-1,0,0,0);	quat.multiply(q,q2,q);
	this._orientation = q;

	if(this._root.scene)
		this._root.scene.refresh();
}

VRCameraController.prototype.onStop = function(e)
{
	if(this._ws)
	{
		this._ws.close();
		this._ws = null;
	}
}

VRCameraController.prototype.onBeforeRender = function(e,dt)
{
	var width = 1024;
	var height = 512;
	var viewport = gl.viewport_data;
	width = v[2];
	height = v[3];

	if(!this._color_texture || this._color_texture.width != width || this._color_texture.height != height)
	{
		this._color_texture = new GL.Texture( width, height,{ format: gl.RGB, filter: gl.LINEAR });
		LS.ResourcesManager.textures[":vr_color_buffer"] = this._color_texture;
	}

	//CHANGE THIS TO USE RENDERFRAMECONTEXT
	if(this.enabled)
	{
		LS.Renderer.color_rendertarget = this._color_texture;
	}
	else
	{
		LS.Renderer.color_rendertarget = null;
	}

	//Renderer.disable_main_render
}


VRCameraController.prototype.onAfterRender = function(e,dt)
{
	if(this._color_texture)
		this._color_texture.toViewport();
}

/* not finished
LS.registerComponent(VRCameraController);
window.VRCameraController = VRCameraController;
*/





/**
* Transitions between different poses
* @class Poser
* @constructor
* @param {String} object to configure from
*/


function Poser(o)
{
	this.poses = {};

	if(o)
		this.configure(o);
}

//Poser["@animation"] = { widget: "resource" };

Poser.prototype.configure = function(o)
{
}


Poser.icon = "mini-icon-clock.png";

Poser.prototype.onAddedToNode = function(node)
{
	LEvent.bind(node,"update",this.onUpdate, this);
}

Poser.prototype.onRemoveFromNode = function(node)
{
	LEvent.unbind(node,"update",this.onUpdate, this);
}

Poser.prototype.onUpdate = function(e, dt)
{


	var scene = this._root.scene;
	if(!scene)
		scene.refresh();
}

Poser.prototype.getResources = function(res)
{
}

Poser.prototype.onResourceRenamed = function (old_name, new_name, resource)
{
}

//LS.registerComponent( Poser );
// This Component shows the possibility of using another Render Engine within WebGLStudio.
// The idea here is to create a component that calls the other render engine renderer during my rendering method
function ThreeJS( o )
{
	this.enabled = true;
	this.autoclear = true; //clears the scene on start

	this._code = ThreeJS.default_code;

	if( typeof(THREE) == "undefined")
		this.loadLibrary( function() { this.setupContext(); } );
	else
		this.setupContext();

	this._script = new LScript();
	//maybe add function to retrieve texture
	this._script.catch_exceptions = false;

	if(o)
		this.configure(o);
}

ThreeJS.prototype.setupContext = function()
{
	if(this._engine)
		return;

	this._engine = {
		component: this,
		node: this._root,
		scene: new THREE.Scene(),
		camera: new THREE.PerspectiveCamera( 70, gl.canvas.width / gl.canvas.height, 1, 1000 ),
		renderer: new THREE.WebGLRenderer( { canvas: gl.canvas, context: gl } ),
		root: new THREE.Object3D()
	};
	this._engine.scene.add( this._engine.root );
}

ThreeJS.default_code = "//renderer, camera, scene, already created, they are globals.\n//use root as your base Object3D node if you want to use the scene manipulators.\n\nthis.start = function() {\n}\n\nthis.render = function(){\n}\n\nthis.update = function(dt){\n}\n";
ThreeJS.library_url = "http://threejs.org/build/three.min.js";


Object.defineProperty( ThreeJS.prototype, "code", {
	set: function(v)
	{
		this._code = v;
		this.processCode();
	},
	get: function() { return this._code; },
	enumerable: true
});

ThreeJS["@code"] = { widget: "code", allow_inline: false };

ThreeJS.prototype.onAddedToScene = function( scene )
{
	LEvent.bind( LS.Renderer, "renderInstances", this.onEvent, this );
	LEvent.bind( scene, "start", this.onEvent, this );
	LEvent.bind( scene, "update", this.onEvent, this );
	LEvent.bind( scene, "finish", this.onEvent, this );
	this.processCode();
}

ThreeJS.prototype.clearScene = function()
{
	if(!this._engine)
		return;

	//remove inside root
	var root = this._engine.root;
	for( var i = root.children.length - 1; i >= 0; i--) 
		root.remove( root.children[i] );

	//remove inside scene but not root
	root = this._engine.scene;
	for( var i = root.children.length - 1; i >= 0; i--) 
		if( root.children[i] != this._engine.root )
			root.remove( root.children[i] );
}

ThreeJS.prototype.onRemovedFromScene = function( scene )
{
	LEvent.unbind( LS.Renderer, "renderInstances", this.onEvent, this );
	LEvent.unbindAll( scene, this );

	//clear scene
	if(this.autoclear)
		this.clearScene();
}

ThreeJS.prototype.onEvent = function( e, param )
{
	if( !this.enabled || !this._engine )
		return;

	var engine = this._engine;

	if(e == "start")
	{
		//clear scene?
		if(this.autoclear)
			this.clearScene();

		if(this._script)
			this._script.callMethod( "start" );
	}
	else if(e == "renderInstances")
	{
		//copy camera info so both cameras matches
		var current_camera = LS.Renderer._current_camera;
		engine.camera.fov = current_camera.fov;
		engine.camera.aspect = current_camera._final_aspect;
		engine.camera.near = current_camera.near;
		engine.camera.far = current_camera.far;
		engine.camera.updateProjectionMatrix()
		engine.camera.position.fromArray( current_camera._global_eye );
		engine.camera.lookAt( new THREE.Vector3( current_camera._global_center[0], current_camera._global_center[1], current_camera._global_center[2] ) );

		//copy the root info
		var global_position = vec3.create();
		if(this._root.transform)
			this._root.transform.getGlobalPosition(	global_position );
		engine.root.position.set( global_position[0], global_position[1], global_position[2] );

		//rotation
		var global_rotation = quat.create();
		if(this._root.transform)
			this._root.transform.getGlobalRotation( global_rotation );
		engine.root.quaternion.set( global_rotation[0], global_rotation[1], global_rotation[2], global_rotation[3] );

		//scale
		var global_scale = vec3.fromValues(1,1,1);
		if(this._root.transform)
			this._root.transform.getGlobalScale( global_scale );
		engine.root.scale.set( global_scale[0], global_scale[1], global_scale[2] );
		
		//render using ThreeJS
		engine.renderer.setSize( gl.viewport_data[2], gl.viewport_data[3] );
		engine.renderer.resetGLState();

		if(this._script)
			this._script.callMethod( "render" );
		else
			engine.renderer.render( engine.scene, engine.camera ); //render the scene

		//reset GL here?
		//read the root position and update the node?
	}
	else if(e == "update")
	{
		if(this._script)
			this._script.callMethod( "update", param );
		else
			engine.scene.update( param );
	}
	else if(e == "finish")
	{
		if(this._script)
			this._script.callMethod( "finish" );
	}
}

/*
ThreeJS.prototype.getCode = function()
{
	return this.code;
}

ThreeJS.prototype.setCode = function( code, skip_events )
{
	this.code = code;
	this.processCode( skip_events );
}
*/

ThreeJS.prototype.loadLibrary = function( on_complete )
{
	if( this._loading )
	{
		LEvent.bind( this, "threejs_loaded", on_complete, this );
		return;
	}

	if(this._loaded)
	{
		if(on_complete)
			on_complete.call(this);
		return;
	}

	this._loading = true;
	var that = this;
	LS.Network.requestScript( ThreeJS.library_url, function(){
		console.log("ThreeJS library loaded");
		that._loading = false;
		that._loaded = true;
		LEvent.trigger( that, "threejs_loaded" );
		LEvent.unbindAllEvent( that, "threejs_loaded" );
		if(!that._engine)
			that.setupContext();
	});
}

ThreeJS.prototype.processCode = function( skip_events )
{
	if(!this._script || !this._root || !this._root.scene )
		return;

	this._script.code = this.code;

	//force threejs inclusion
	if( typeof(THREE) == "undefined")
	{
		this.loadLibrary( function() { 
			this.processCode(); 
		});
		return;
	}

	if(!this._engine)
		this.setupContext();

	if(this._root && !LS.Script.block_execution )
	{
		//compiles and executes the context
		return this._script.compile( this._engine, true );
	}
	return true;
}


LS.registerComponent( ThreeJS );

function InteractiveController(o)
{
	this.enabled = true;
	this.mode = InteractiveController.PICKING;
	this.send_trigger = true;
	this.self_trigger = true;
	this.layers = 3;

	if(o)
		this.configure(o);
}

InteractiveController.icon = "mini-icon-cursor.png";

InteractiveController.PICKING = 1;
InteractiveController.BOUNDING = 2;
InteractiveController.COLLIDERS = 3;

InteractiveController["@mode"] = { type: "enum", values: { "Picking": InteractiveController.PICKING, "Bounding": InteractiveController.BOUNDING, "Colliders": InteractiveController.COLLIDERS }};
InteractiveController["@layers"] = { type: "layers" };

InteractiveController.prototype.onAddedToScene = function(scene)
{
	LEvent.bind( scene, "mousedown", this._onMouse, this );
	LEvent.bind( scene, "mousemove", this._onMouse, this );
	LEvent.bind( scene, "mouseup", this._onMouse, this );
}

InteractiveController.prototype.onRemovedFromScene = function(scene)
{
	LEvent.unbindAll( scene, this );
}

InteractiveController.prototype.getNodeUnderMouse = function( e )
{
	var layers = this.layers;

	if(this.mode == InteractiveController.PICKING)
		return LS.Picking.getNodeAtCanvasPosition( e.canvasx, e.canvasy, null, layers );

	if(this.mode == InteractiveController.BOUNDING)
	{
		var camera = LS.Renderer.getCameraAtPosition(e.canvasx, e.canvasy);
		if(!camera)
			return null;

		var ray = camera.getRayInPixel( e.canvasx, e.canvasy );
		var collisions = LS.Picking.raycast( ray.start, ray.direction, { layers: layers } );
		if(!collisions || !collisions.length)
			return null;
		return collisions[0].node;
	}

	if(this.mode == InteractiveController.COLLIDERS)
	{
		var camera = LS.Renderer.getCameraAtPosition(e.canvasx, e.canvasy);
		if(!camera)
			return null;
		var ray = camera.getRayInPixel( e.canvasx, e.canvasy );
		var collisions = LS.Physics.raycast( ray.start, ray.direction, { layers: layers } );
		if(!collisions || !collisions.length)
			return null;
		return collisions[0].node;
	}

	return null;

}

InteractiveController.prototype._onMouse = function(type, e)
{
	if(!this.enabled)
		return;

	//Intereactive: check which node was clicked (this is a mode that helps clicking stuff)
	if(e.eventType == "mousedown" || e.eventType == "mousewheel" )
	{
		var node = this.getNodeUnderMouse(e);
		this._clicked_node = node;
		if(this._clicked_node && e.eventType == "mousedown" && e.button == 0 )
		{
			if( this.send_trigger )
				LEvent.trigger( this._clicked_node, "trigger", e );
			if( this.self_trigger )
				LEvent.trigger( this._root, "trigger", this._clicked_node );
		}
	}

	var levent = null; //levent dispatched

	//send event to clicked node
	if(this._clicked_node) // && this._clicked_node.flags.interactive)
	{
		e.scene_node = this._clicked_node;
		levent = LEvent.trigger( this._clicked_node, e.eventType, e );
	}

	if(e.eventType == "mouseup")
		this._clicked_node = null;
}


LS.registerComponent( InteractiveController );

if(typeof(LiteGraph) != "undefined")
{
	/* Scene LNodes ***********************/

	global.LGraphScene = function()
	{
		this.addOutput("Time","number");
	}

	LGraphScene.title = "Scene";
	LGraphScene.desc = "Scene";

	LGraphScene.getComponents = function(node, result)
	{
		result = result || [];
		var compos = node.getComponents();
		if(!compos)
			return result;

		for(var i = 0; i < compos.length; ++i)
		{
			var name = LS.getClassName( compos[i].constructor );
			result.push( [name, name] );
		}

		return result;
	}

	LGraphScene.prototype.onExecute = function()
	{
		var scene = this.graph.getScene();

		//read inputs
		if(this.inputs)
		for(var i = 0; i < this.inputs.length; ++i)
		{
			var input = this.inputs[i]; //??
			var v = this.getInputData(i);
			if(v === undefined)
				continue;
		}

		//write outputs
		if(this.outputs)
		for(var i = 0; i < this.outputs.length; ++i)
		{
			var output = this.outputs[i];
			if(!output.links || !output.links.length)
				continue;
			var result = null;
			switch( output.name )
			{
				case "Time": result = scene.getTime(); break;
				case "Elapsed": result = (scene._last_dt != null ? scene._last_dt : 0); break;
				case "Frame": result = (scene._frame != null ? scene._frame : 0); break;
				default:
					result = scene.root.getComponent(output.name);
			}
			this.setOutputData(i,result);
		}
	}

	LGraphScene.prototype.onGetOutputs = function()
	{
		var r = [["Elapsed","number"],["Frame","number"]];
		return LGraphScene.getComponents( this.graph.getScene().root, r);
	}

	LiteGraph.registerNodeType("scene/scene", LGraphScene );

	//********************************************************

	global.LGraphSceneNode = function()
	{
		this.properties = {node_id:""};
		this.size = [100,20];

		this.addInput("node_id", "string", { locked: true });

		if(LGraphSceneNode._current_node_id)
			this.properties.node_id = LGraphSceneNode._current_node_id;
	}

	LGraphSceneNode.title = "SceneNode";
	LGraphSceneNode.desc = "Node on the scene";

	LGraphSceneNode.prototype.getNode = function()
	{
		var node_id = null;

		//first check input
		if(this.inputs && this.inputs[0])
			node_id = this.getInputData(0);
		if(node_id)
			this.properties.node_id = node_id;

		var scene = this.graph.getScene();
		var node = null;

		//then check properties
		if(	!node_id && this.properties.node_id )
			node_id = this.properties.node_id;

		if(node_id)
			node = scene.getNode( node_id );

		//otherwise use the graph node
		if(!node)
			node = this.graph._scenenode;
		return node;
	}

	LGraphSceneNode.prototype.onExecute = function()
	{
		var node = this.getNode();

		//read inputs
		if(this.inputs) //there must be inputs always but just in case
		{
			for(var i = 1; i < this.inputs.length; ++i)
			{
				var input = this.inputs[i];
				var v = this.getInputData(i);
				if(v === undefined)
					continue;
				switch( input.name )
				{
					case "Transform": node.transform.copyFrom(v); break;
					case "Material": node.material = v;	break;
					case "Visible": node.flags.visible = v; break;
					default:

						break;
				}
			}
		}

		//write outputs
		if(this.outputs)
		for(var i = 0; i < this.outputs.length; ++i)
		{
			var output = this.outputs[i];
			if(!output.links || !output.links.length)
				continue;
			switch( output.name )
			{
				case "Material": this.setOutputData( i, node.getMaterial() ); break;
				case "Transform": this.setOutputData( i, node.transform ); break;
				case "Mesh": this.setOutputData(i, node.getMesh()); break;
				case "Visible": this.setOutputData(i, node.flags.visible ); break;
				default:
					var compo = node.getComponentByUId( output.name );
					if(!compo)
					{
						//SPECIAL CASE: maybe the node id changed so the output.name contains the uid of another node, in that case replace it
						var old_compo = node.scene.findComponentByUId( output.name );
						if(old_compo)
						{
							var class_name = LS.getObjectClassName( old_compo );
							compo = node.getComponent( class_name );
							if( compo )
								output.name = compo.uid; //replace the uid
						}
					}

					this.setOutputData(i, compo );
					break;
			}
		}
	}

	LGraphSceneNode.prototype.getComponents = function(result)
	{
		result = result || [];
		var node = this.getNode();
		if(!node)
			return result;
		var compos = node.getComponents();
		if(!compos)
			return result;

		for(var i = 0; i < compos.length; ++i)
		{
			var name = LS.getClassName( compos[i].constructor );
			result.push( [ compos[i].uid, name, { label: name } ] );
		}

		return result;
	}

	LGraphSceneNode.prototype.onDropItem = function( event )
	{
		var node_id = event.dataTransfer.getData("node_id");
		if(!node_id)
			return;
		this.properties.node_id = node_id;
		this.onExecute();
		return true;
	}

	LGraphSceneNode.prototype.onGetInputs = function()
	{
		var result = [["Visible","boolean"],["Material","Material"]];
		return this.getComponents(result);
		//return [["Transform","Transform"],["Material","Material"],["Mesh","Mesh"],["Enabled","boolean"]];
	}

	LGraphSceneNode.prototype.onGetOutputs = function()
	{
		var result = [["Visible","boolean"],["Material","Material"]];
		return this.getComponents(result);
		//return [["Transform","Transform"],["Material","Material"],["Mesh","Mesh"],["Enabled","boolean"]];
	}

	/*
	LGraphSceneNode.prototype.onGetOutputs = function()
	{
		var node = this.getNode();
		var r = [];
		for(var i = 0; i < node._components.length; ++i)
		{
			var comp = node._components[i];
			var classname = getObjectClassName(comp);
			var vars = getObjectAttributes(comp);
			r.push([classname,vars]);
		}
		return r;
		*/

		/*
		var r = [["Transform","Transform"],["Material","Material"],["Mesh","Mesh"],["Enabled","boolean"]];
		if(node.light)
			r.push(["Light","Light"]);
		if(node.camera)
			r.push(["Camera","Camera"]);
		return r;
	}
	*/

	LiteGraph.registerNodeType("scene/node", LGraphSceneNode );

	//********************************************************

	/* LGraphNode representing an object in the Scene */

	global.LGraphTransform = function()
	{
		this.properties = {node_id:""};
		if(LGraphSceneNode._current_node_id)
			this.properties.node = LGraphSceneNode._current_node_id;
		this.addInput("Transform", "Transform", { locked: true });
		this.addOutput("Position","vec3");
	}

	LGraphTransform.title = "Transform";
	LGraphTransform.desc = "Transform info of a node";

	LGraphTransform.prototype.onExecute = function()
	{
		var transform = null;

		if(this.inputs && this.inputs[0])
			transform = this.getInputData(0);

		if(!transform)
		{
			var scene = this.graph.getScene();
			if(!scene)
				return;

			var node = this._node;
			if(	this.properties.node )
			{
				node = scene.getNode( this.properties.node );
				if(!node)
					return;
			}

			if(!node)
				node = this.graph._scenenode;

			transform = node.transform;
		}

		if(!transform)
			return;

		//read inputs
		if(this.inputs)
		for(var i = 1; i < this.inputs.length; ++i)
		{
			var input = this.inputs[i];
			var v = this.getInputData(i);
			if(v === undefined)
				continue;
			switch( input.name )
			{
				case "x": transform.x = v; break;
				case "y": transform.y = v; break;
				case "z": transform.z = v; break;
				case "Position": transform.setPosition(v); break;
				case "Rotation": transform.setRotation(v); break;
				case "Scale": transform.setScale(v); break;
				case "Matrix": transform.fromMatrix(v); break;
				case "Translate": transform.translate(v); break;
				case "Translate Local": transform.translateLocal(v); break;
				case "RotateY": transform.rotateY(v); break;
			}
		}

		//write outputs
		if(this.outputs)
		for(var i = 0; i < this.outputs.length; ++i)
		{
			var output = this.outputs[i];
			if(!output.links || !output.links.length)
				continue;

			var value = undefined;
			switch( output.name )
			{
				case "x": value = transform.x; break;
				case "y": value = transform.y; break;
				case "z": value = transform.z; break;
				case "Position": value = transform.position; break;
				case "Global Position": value = transform.getGlobalPosition(); break;
				case "Rotation": value = transform.rotation; break;
				case "Global Rotation": value = transform.getGlobalRotation(); break;
				case "Scale": value = transform.scaling; break;
				case "Matrix": value = transform.getMatrix(); break;
				default:
					break;
			}

			if(value !== undefined)
				this.setOutputData( i, value );
		}
	}

	LGraphTransform.prototype.onGetInputs = function()
	{
		return [["Position","vec3"],["Rotation","quat"],["Scale","number"],["x","number"],["y","number"],["z","number"],["Global Position","vec3"],["Global Rotation","quat"],["Matrix","mat4"],["Translate","vec3"],["Translate Local","vec3"],["RotateY","number"]];
	}

	LGraphTransform.prototype.onGetOutputs = function()
	{
		return [["Position","vec3"],["Rotation","quat"],["Scale","number"],["x","number"],["y","number"],["z","number"],["Global Position","vec3"],["Global Rotation","quat"],["Matrix","mat4"]];
	}

	LiteGraph.registerNodeType("scene/transform", LGraphTransform );

	//***********************************************************************

	global.LGraphMaterial = function()
	{
		this.properties = {mat_name:""};
		this.addInput("Material","Material");
		this.size = [100,20];
	}

	LGraphMaterial.title = "Material";
	LGraphMaterial.desc = "Material of a node";

	LGraphMaterial.prototype.onExecute = function()
	{
		var mat = this.getMaterial();
		if(!mat)
			return;

		//read inputs
		for(var i = 0; i < this.inputs.length; ++i)
		{
			var input = this.inputs[i];
			var v = this.getInputData(i);
			if(v === undefined)
				continue;

			if(input.name == "Material")
				continue;

			mat.setProperty(input.name, v);

			/*
			switch( input.name )
			{
				case "Alpha": mat.alpha = v; break;
				case "Specular f.": mat.specular_factor = v; break;
				case "Diffuse": vec3.copy(mat.diffuse,v); break;
				case "Ambient": vec3.copy(mat.ambient,v); break;
				case "Emissive": vec3.copy(mat.emissive,v); break;
				case "UVs trans.": mat.uvs_matrix.set(v); break;
				default:
					if(input.name.substr(0,4) == "tex_")
					{
						var channel = input.name.substr(4);
						mat.setTexture(v, channel);
					}
					break;
			}
			*/
		}

		//write outputs
		if(this.outputs)
		for(var i = 0; i < this.outputs.length; ++i)
		{
			var output = this.outputs[i];
			if(!output.links || !output.links.length)
				continue;
			var v = mat.getProperty( output.name );
			/*
			var v;
			switch( output.name )
			{
				case "Material": v = mat; break;
				case "Alpha": v = mat.alpha; break;
				case "Specular f.": v = mat.specular_factor; break;
				case "Diffuse": v = mat.diffuse; break;
				case "Ambient": v = mat.ambient; break;
				case "Emissive": v = mat.emissive; break;
				case "UVs trans.": v = mat.uvs_matrix; break;
				default: continue;
			}
			*/
			this.setOutputData( i, v );
		}

		//this.setOutputData(0, parseFloat( this.properties["value"] ) );
	}

	LGraphMaterial.prototype.getMaterial = function()
	{
		//if it has an input material, use that one
		var slot = this.findInputSlot("Material");
		if( slot != -1)
			return this.getInputData( slot );

		if(	this.properties.mat_name )
			return LS.RM.materials[ this.properties.mat_name ];

		return null;
	}

	LGraphMaterial.prototype.onGetInputs = function()
	{
		var mat = this.getMaterial();
		if(!mat) return;
		var o = mat.getProperties();
		var results = [["Material","Material"]];
		for(var i in o)
			results.push([i,o[i]]);
		return results;

		/*
		var results = [["Material","Material"],["Alpha","number"],["Specular f.","number"],["Diffuse","color"],["Ambient","color"],["Emissive","color"],["UVs trans.","texmatrix"]];
		for(var i in Material.TEXTURE_CHANNELS)
			results.push(["Tex." + Material.TEXTURE_CHANNELS[i],"Texture"]);
		return results;
		*/
	}

	LGraphMaterial.prototype.onGetOutputs = function()
	{
		var mat = this.getMaterial();
		if(!mat) return;
		var o = mat.getProperties();
		var results = [["Material","Material"]];
		for(var i in o)
			results.push([i,o[i]]);
		return results;

		/*
		var results = [["Material","Material"],["Alpha","number"],["Specular f.","number"],["Diffuse","color"],["Ambient","color"],["Emissive","color"],["UVs trans.","texmatrix"]];
		for(var i in Material.TEXTURE_CHANNELS)
			results.push(["Tex." + Material.TEXTURE_CHANNELS[i],"Texture"]);
		return results;
		*/
	}

	LiteGraph.registerNodeType("scene/material", LGraphMaterial );
	global.LGraphMaterial = LGraphMaterial;

	//********************************************************

	global.LGraphComponent = function()
	{
		this.properties = {
			node: "",
			component: ""
		};

		this.addInput("Component", undefined, { locked: true });

		this._component = null;
	}

	LGraphComponent.title = "Component";
	LGraphComponent.desc = "A component from a node";

	LGraphComponent.prototype.onConnectInput = function( slot, type )
	{
		if (slot == 0 && !LS.Components[type])
			return false;
	}

	LGraphComponent.prototype.onExecute = function()
	{
		var compo = this.getComponent();
		if(!compo)
			return;

		//read inputs (skip 1, is the component)
		for(var i = 1; i < this.inputs.length; i++)
		{
			var input = this.inputs[i];
			var v = this.getInputData(i);
			if(v === undefined)
				continue;
			LS.setObjectProperty( compo, input.name, v );
		}

		//write outputs
		for(var i in this.outputs)
		{
			var output = this.outputs[i];
			if(!output.links || !output.links.length)
				continue;

			//could be better...
			this.setOutputData(i, compo[ output.name ] );
		}
	}

	LGraphComponent.prototype.onDrawBackground = function()
	{
		var compo = this.getComponent();
		if(compo)
			this.title = LS.getClassName( compo.constructor );
	}

	LGraphComponent.prototype.getComponent = function()
	{
		var v = this.getInputData(0);
		if(v)
			return v;

		var scene = this.graph._scene;
		if(!scene) 
			return null;

		var node_id = this.properties.node;
		if(!node_id)
			return;

		//find node
		var node = scene.getNode( node_id );
		if(!node)
			return null;

		//find compo
		var compo_id = this.properties.component;
		var compo = null;
		if(compo_id.charAt(0) == "@")
			compo = node.getComponentByUId( compo_id );
		else if( LS.Components[ compo_id ] )
			compo = node.getComponent( LS.Components[ compo_id ] );
		else
			return null;

		if(compo && !compo.constructor.is_component)
			return null;

		this._component = compo;
		return compo;
	}

	LGraphComponent.prototype.getComponentProperties = function( v )
	{
		var compo = this.getComponent();
		if(!compo)
			return null;

		var attrs = null;
		if(compo.getProperties)
			attrs = compo.getProperties( v );
		else
			attrs = LS.getObjectProperties( compo );

		var result = [];
		for(var i in attrs)
			result.push( [i, attrs[i]] );
		return result;
	}

	LGraphComponent.prototype.onGetInputs = function() { return this.getComponentProperties("input"); }
	LGraphComponent.prototype.onGetOutputs = function() { return this.getComponentProperties("output"); }

	LiteGraph.registerNodeType("scene/component", LGraphComponent );

	//************************************************************

	global.LGraphLight = function()
	{
		this.properties = {mat_name:""};
		this.addInput("Light","Light");
		this.addOutput("Intensity","number");
		this.addOutput("Color","color");
	}

	LGraphLight.title = "Light";
	LGraphLight.desc = "Light from a scene";

	LGraphLight.prototype.onExecute = function()
	{
		var scene = this.graph.getScene();
		if(!scene)
			return;

		var node = this._node;
		if(	this.properties.node_id )
			node = scene.getNode( this.properties.node_id );

		if(!node)
			node = this.graph._scenenode;

		var light = null;
		if(node) //use light of the node
			light = node.getLight();
		//if it has an input light
		var slot = this.findInputSlot("Light");
		if( slot != -1 )
			light = this.getInputData(slot);
		if(!light)
			return;

		//read inputs
		for(var i = 0; i < this.inputs.length; ++i)
		{
			var input = this.inputs[i];
			var v = this.getInputData(i);
			if(v === undefined)
				continue;

			switch( input.name )
			{
				case "Intensity": light.intensity = v; break;
				case "Color": vec3.copy(light.color,v); break;
				case "Eye": vec3.copy(light.eye,v); break;
				case "Center": vec3.copy(light.center,v); break;
			}
		}

		//write outputs
		for(var i = 0; i < this.outputs.length; ++i)
		{
			var output = this.outputs[i];
			if(!output.links || !output.links.length)
				continue;

			switch( output.name )
			{
				case "Light": this.setOutputData(i, light ); break;
				case "Intensity": this.setOutputData(i, light.intensity ); break;
				case "Color": this.setOutputData(i, light.color ); break;
				case "Eye": this.setOutputData(i, light.eye ); break;
				case "Center": this.setOutputData(i, light.center ); break;
			}
		}
	}

	LGraphLight.prototype.onGetInputs = function()
	{
		return [["Light","Light"],["Intensity","number"],["Color","color"],["Eye","vec3"],["Center","vec3"]];
	}

	LGraphLight.prototype.onGetOutputs = function()
	{
		return [["Light","Light"],["Intensity","number"],["Color","color"],["Eye","vec3"],["Center","vec3"]];
	}

	LiteGraph.registerNodeType("scene/light", LGraphLight );

	//************************************

	global.LGraphGlobal = function()
	{
		this.addOutput("Value");
		this.properties = {name:"myvar", value: 0, type: "number", min:0, max:1 };
	}

	LGraphGlobal.title = "Global";
	LGraphGlobal.desc = "Global var for the graph";
	LGraphGlobal["@type"] = { type:"enum", values:["number","string","node","vec2","vec3","vec4","color","texture"]};

	LGraphGlobal.prototype.onExecute = function()
	{
		if(!this.properties.name)
			return;

		this.setOutputData(0, this.properties.value);
	}

	LGraphGlobal.prototype.onDrawBackground = function()
	{
		var name = this.properties.name;
		this.outputs[0].label = name;
	}

	LiteGraph.registerNodeType("scene/global", LGraphGlobal );

	//************************************

	global.LGraphLocatorProperty = function()
	{
		this.addInput("in");
		this.addOutput("out");
		this.size = [80,20];
		this.properties = {locator:""};
	}

	LGraphLocatorProperty.title = "Property";
	LGraphLocatorProperty.desc = "A property of a node or component of the scene specified by its locator string";

	LGraphLocatorProperty.prototype.onExecute = function()
	{
		var locator = this.properties.locator;
		if(!this.properties.locator)
			return;

		var info = this._locator_info = LS.GlobalScene.getPropertyInfo( locator );

		if(info && info.target)
		{
			this.title = info.name;
			if( this.inputs.length && this.inputs[0].link !== null )
				LSQ.setFromInfo( info, this.getInputData(0) );
			if( this.outputs.length && this.outputs[0].links && this.outputs[0].links.length )
				this.setOutputData( 0, LSQ.getFromInfo( info ));
		}
	}

	LiteGraph.registerNodeType("scene/property", LGraphLocatorProperty );

	//************************************

	global.LGraphFrame = function()
	{
		this.addOutput("Color","Texture");
		this.addOutput("Depth","Texture");
		this.addOutput("Extra","Texture");
		this.addOutput("Camera","Camera");
		this.properties = {};
	}

	LGraphFrame.title = "Frame";
	LGraphFrame.desc = "One frame rendered from the scene renderer";

	LGraphFrame.prototype.onExecute = function()
	{
		this.setOutputData(0, LGraphTexture.getTexture( this._color_texture ) );
		this.setOutputData(1, LGraphTexture.getTexture( this._depth_texture ) );
		this.setOutputData(2, LGraphTexture.getTexture( this._extra_texture ) );
		this.setOutputData(3, this._camera );
	}

	LGraphFrame.prototype.onDrawBackground = function( ctx )
	{
		if( this.flags.collapsed || this.size[1] <= 20 )
			return;

		if(!this._color_texture)
			return;

		if( !ctx.webgl )
			return; //is not working well

		//Different texture? then get it from the GPU
		if(this._last_preview_tex != this._last_tex || !this._last_preview_tex)
		{
			if( ctx.webgl && this._canvas && this._canvas.constructor === GL.Texture )
			{
				this._canvas = this._last_tex;
			}
			else
			{
				var texture = LGraphTexture.getTexture( this._color_texture );
				if(!texture)
					return;

				var tex_canvas = LGraphTexture.generateLowResTexturePreview( texture );
				if(!tex_canvas) 
					return;
				this._last_preview_tex = this._last_tex;
				this._canvas = cloneCanvas( tex_canvas );
			}
		}

		if(!this._canvas)
			return;

		//render to graph canvas
		ctx.save();
		if(!ctx.webgl) //reverse image
		{
			if( this._canvas.constructor === GL.Texture )
			{
				this._canvas = null;
				return;
			}

			ctx.translate( 0,this.size[1] );
			ctx.scale(1,-1);
		}
		ctx.drawImage( this._canvas, 0, 0, this.size[0], this.size[1] );
		ctx.restore();
	}

	LiteGraph.registerNodeType("scene/frame", LGraphFrame );
};

//Interpolation methods
LS.NONE = 0;
LS.LINEAR = 1;
LS.TRIGONOMETRIC = 2;
LS.BEZIER = 3;
LS.SPLINE = 4;

/**
* An Animation is a resource that contains samples of properties over time, similar to animation curves
* Values could be associated to an specific node.
* Data is contained in tracks
*
* @class Animation
* @namespace LS
* @constructor
*/

function Animation(o)
{
	this.name = "";
	this.takes = {}; //packs of tracks
	if(o)
		this.configure(o);
}

Animation.DEFAULT_SCENE_NAME = "@scene";

Animation.prototype.createTake = function( name, duration )
{
	var take = new Animation.Take();
	take.name = name;
	take.duration = duration || 0;
	this.addTake( take );
	return take;
}

Animation.prototype.addTake = function(take)
{
	this.takes[ take.name ] = take;
	return take;
}

Animation.prototype.getTake = function( name )
{
	return this.takes[ name ];
}

Animation.prototype.addTrackToTake = function(takename, track)
{
	var take = this.takes[ takename ];
	if(!take)
		take = this.createTake( takename );
	take.addTrack( track );
}


Animation.prototype.configure = function(data)
{
	if(data.name)
		this.name = data.name;

	if(data.takes)
	{
		this.takes = {};
		for(var i in data.takes)
		{
			var take = new LS.Animation.Take( data.takes[i] );
			if(!take.name)
				console.warn("Take without name");
			else
			{
				this.addTake( take );
				take.loadResources(); //load associated resources
			}
		}
	}
}

Animation.prototype.serialize = function()
{
	return LS.cloneObject(this, null, true);
}

Animation.fromBinary = function( data )
{
	if(data.constructor == ArrayBuffer)
		data = WBin.load(data, true);

	var o = data["@json"];
	for(var i in o.takes)
	{
		var take = o.takes[i];
		for(var j in take.tracks)
		{
			var track = take.tracks[j];
			var name = "@take_" + i + "_track_" + j;
			if( data[name] )
				track.data = data[name];
		}
	}

	return new LS.Animation( o );
}

Animation.prototype.toBinary = function()
{
	var o = {};
	var tracks_data = [];

	//we need to remove the bin data to generate the JSON
	for(var i in this.takes)
	{
		var take = this.takes[i];
		for(var j in take.tracks)
		{
			var track = take.tracks[j];
			track.packData(); //reduce storage space and speeds up loading

			if(track.packed_data)
			{
				var bindata = track.data;
				var name = "@take_" + i + "_track_" + j;
				o[name] = bindata;
				track.data = null;
				tracks_data.push( bindata );
			}
		}
	}

	//create the binary
	o["@json"] = LS.cloneObject(this, null, true);
	var bin = WBin.create(o, "Animation");

	//restore the bin data state in this instance
	for(var i in this.takes)
	{
		var take = this.takes[i];
		for(var j in take.tracks)
		{
			var track = take.tracks[j];
			var name = "@take_" + i + "_track_" + j;
			if(o[name])
				track.data = o[name];
		}
	}

	return bin;
}

//Used when the animation tracks use UIDs instead of node names
//to convert the track locator to node names, so they can be reused between nodes in the same scene
Animation.prototype.convertIDstoNames = function( use_basename, root )
{
	var num = 0;
	for(var i in this.takes)
	{
		var take = this.takes[i];
		num += take.convertIDstoNames( use_basename, root );
	}
	return num;
}

Animation.prototype.optimizeTracks = function()
{
	var num = 0;
	for(var i in this.takes)
	{
		var take = this.takes[i];
		num += take.optimizeTracks();
	}
	return num;
}


LS.Classes["Animation"] = LS.Animation = Animation;

/** Represents a set of animations **/
function Take(o)
{
	this.name = null;
	this.tracks = [];
	this.duration = 10;
	
	if(o)
		this.configure(o);

}

Take.prototype.configure = function( o )
{
	if( o.name )
		this.name = o.name;
	if( o.tracks ) 
	{
		this.tracks = []; //clear
		for(var i in o.tracks)
		{
			var track = new LS.Animation.Track( o.tracks[i] );
			this.addTrack( track );
		}
	}
	if( o.duration )
		this.duration = o.duration;
}

Take.prototype.serialize = function()
{
	return LS.cloneObject(this, null, true);
}

Take.prototype.createTrack = function( data )
{
	if(!data)
		throw("Data missing when creating track");

	var track = this.getTrack( data.property );
	if( track )
		return track;

	var track = new LS.Animation.Track( data );
	this.addTrack( track );
	return track;
}

/**
* For every track, gets the interpolated value between keyframes and applies the value to the property associated with the track locator
* Locators are in the form of "{NODE_UID}/{COMPONENT_UID}/{property_name}"
*
* @method applyTracks
* @param {number} current_time the time of the anim to sample
* @param {number} last_time this is used for events, we need to know where you were before
* @param {boolean} ignore_interpolation in case you want to sample the nearest one
* @param {SceneNode} root [Optional] if you want to limit the locator to search inside a node
* @return {Component} the target where the action was performed
*/
Take.prototype.applyTracks = function( current_time, last_time, ignore_interpolation, root_node )
{
	for(var i = 0; i < this.tracks.length; ++i)
	{
		var track = this.tracks[i];
		if( track.enabled === false || !track.data )
			continue;

		//events are an special kind of tracks, they execute actions
		if( track.type == "events" )
		{
			var keyframe = track.getKeyframeByTime( current_time );
			if( !keyframe || keyframe[0] < last_time || keyframe[0] > current_time )
				return;

			//need info to search for node
			var info = LS.GlobalScene.getPropertyInfoFromPath( track._property_path );
			if(!info)
				return;

			if(info.node && info.target && info.target[ keyframe[1][0] ] )
				info.target[ keyframe[1][0] ].call( info.target, keyframe[1][1] );
		}
		else //regular tracks
		{
			//read from the animation track the value
			var sample = track.getSample( current_time, !ignore_interpolation );
			//apply the value to the property specified by the locator
			if( sample !== undefined ) 
				track._target = LS.GlobalScene.setPropertyValueFromPath( track._property_path, sample, root_node, 0 );
		}
	}
}



Take.prototype.addTrack = function( track )
{
	this.tracks.push( track );
}

Take.prototype.getTrack = function( property )
{
	for(var i = 0; i < this.tracks.length; ++i)
		if(this.tracks[i].property == property)
			return this.tracks[i];
	return null;
}

Take.prototype.removeTrack = function( track )
{
	for(var i = 0; i < this.tracks.length; ++i)
		if(this.tracks[i] == track)
		{
			this.tracks.splice( i, 1 );
			return;
		}
}


Take.prototype.getPropertiesSample = function(time, result)
{
	result = result || [];
	for(var i = 0; i < this.tracks.length; ++i)
	{
		var track = this.tracks[i];
		var value = track.getSample( time );
		result.push([track.property, value]);
	}
	return result;
}

Take.prototype.actionPerSample = function(time, callback, options)
{
	for(var i = 0; i < this.tracks.length; ++i)
	{
		var track = this.tracks[i];
		var value = track.getSample(time, true);
		if( options.disabled_tracks && options.disabled_tracks[ track.property ] )
			continue;
		callback(track.property, value, options);
	}
}

//Ensures all the resources associated to keyframes are loaded in memory
Take.prototype.loadResources = function()
{
	for(var i = 0; i < this.tracks.length; ++i)
	{
		var track = this.tracks[i];
		if(track.type == "texture")
		{
			var l = track.getNumberOfKeyframes();
			for(var j = 0; j < l; ++j)
			{
				var keyframe = track.getKeyframe(j);
				if(keyframe && keyframe[1] && keyframe[1][0] != ":")
					LS.ResourcesManager.load( keyframe[1] );
			}
		}
	}
}

//convert track locators from using UIDs to use node names (this way the same animation can be used in several parts of the scene)
Take.prototype.convertIDstoNames = function( use_basename, root )
{
	var num = 0;
	for(var j = 0; j < this.tracks.length; ++j)
	{
		var track = this.tracks[j];
		num += track.convertIDtoName( use_basename, root )
	}
	return num;
}

//optimize animations
Take.prototype.optimizeTracks = function()
{
	var num = 0;
	var temp = new Float32Array(10);

	for(var i = 0; i < this.tracks.length; ++i)
	{
		var track = this.tracks[i];
		if( track.value_size != 16 )
			continue;

		//convert locator
		var path = track.property.split("/");
		if( path[ path.length - 1 ] != "matrix")
			continue;
		path[ path.length - 1 ] = "Transform/data";
		track.property = path.join("/");
		track.type = "trans10";
		track.value_size = 10;

		//convert samples
		if(!track.packed_data)
		{
			console.warn("convertMatricesToData only works with packed data");
			continue;
		}

		var data = track.data;
		var num_samples = data.length / 17;
		for(var k = 0; k < num_samples; ++k)
		{
			var sample = data.subarray(k*17+1,(k*17)+17);
			var new_data = LS.Transform.fromMatrix4ToTransformData( sample, temp );
			data[k*11] = data[k*17]; //timestamp
			data.set(temp,k*11+1); //overwrite inplace (because the output is less big that the input)
		}
		track.data = new Float32Array( data.subarray(0,num_samples*11) );
		num += 1;
	}
	return num;
}

Take.prototype.matchTranslation = function( root )
{
	var num = 0;

	for(var i = 0; i < this.tracks.length; ++i)
	{
		var track = this.tracks[i];

		if(track.type != "trans10" && track.type != "mat4")
			continue;

		if( !track._property_path || !track._property_path.length )
			continue;

		var node = LSQ.get( track._property_path[0], root );
		if(!node)
			continue;
		
		var position = node.transform.position;
		var offset = track.value_size + 1;

		var data = track.data;
		var num_samples = data.length / offset;
		if(track.type == "trans10")
		{
			for(var j = 0; j < num_samples; ++j)
				data.set( position, j*offset + 1 );
		}
		else if(track.type == "mat4")
		{
			for(var j = 0; j < num_samples; ++j)
				data.set( position, j*offset + 1 + 12 ); //12,13,14 contain translation
		}

		num += 1;
	}

	return num;
}

Take.prototype.onlyRotations = function()
{
	var num = 0;
	var temp = new Float32Array(10);
	var final_quat = temp.subarray(3,7);

	for(var i = 0; i < this.tracks.length; ++i)
	{
		var track = this.tracks[i];

		//convert locator
		var path = track.property.split("/");
		var last_path = path[ path.length - 1 ];
		var old_size = track.value_size;
		if( track.type != "mat4" && track.type != "trans10" )
			continue;

		if(last_path == "matrix")
			path[ path.length - 1 ] = "Transform/rotation";
		else if (last_path == "data")
			path[ path.length - 1 ] = "rotation";

		track.property = path.join("/");
		var old_type = track.type;
		track.type = "quat";
		track.value_size = 4;

		//convert samples
		if(!track.packed_data)
		{
			console.warn("convertMatricesToData only works with packed data");
			continue;
		}

		var data = track.data;
		var num_samples = data.length / (old_size+1);

		if( old_type == "mat4" )
		{
			for(var k = 0; k < num_samples; ++k)
			{
				var sample = data.subarray(k*17+1,(k*17)+17);
				var new_data = LS.Transform.fromMatrix4ToTransformData( sample, temp );
				data[k*11] = data[k*17]; //timestamp
				data.set( final_quat, k*5+1); //overwrite inplace (because the output is less big that the input)
			}
		}
		else if( old_type == "trans10" )
		{
			for(var k = 0; k < num_samples; ++k)
			{
				var sample = data.subarray(k*11+4,(k*11)+8);
				data[k*5] = data[k*11]; //timestamp
				data.set( sample, k*5+1); //overwrite inplace (because the output is less big that the input)
			}
		}
		
		track.data = new Float32Array( data.subarray(0,num_samples*5) );
		num += 1;
	}
	return num;
}


Take.prototype.setInterpolationToAllTracks = function( interpolation )
{
	var num = 0;
	for(var i = 0; i < this.tracks.length; ++i)
	{
		var track = this.tracks[i];
		if(track.interpolation == interpolation)
			continue;
		track.interpolation = interpolation;
		num += 1;
	}

	return num;
}

Animation.Take = Take;


/**
* Represents one track with data over time about one property
* Data could be stored in two forms, or an array containing arrays of [time,data] or in a single typed array, depends on the attribute typed_mode
*
* @class Animation.Track
* @namespace LS
* @constructor
*/

function Track(o)
{
	this.enabled = true;
	this.name = ""; //title
	this.type = null; //type of data (number, vec2, color, texture, etc)
	this.interpolation = LS.NONE;
	this.looped = false; //interpolate last keyframe with first

	//data
	this.packed_data = false; //this means the data is stored in one continuous datatype, faster to load but not editable
	this.value_size = 0; //how many numbers contains every sample of this property, 0 means basic type (string, boolean)
	this.data = null; //array or typed array where you have the time value followed by this.value_size bytes of data
	this.data_table = null; //used to index data when storing it

	//to speed up sampling
	Object.defineProperty( this, '_property', {
		value: "",
		enumerable: false,
		writable: true
	});

	Object.defineProperty( this, '_property_path', {
		value: [],
		enumerable: false,
		writable: true
	});

	if(o)
		this.configure(o);
}

Track.FRAMERATE = 30;

//string identifying the property being animated in a locator form ( node/component_uid/property )
Object.defineProperty( Track.prototype, 'property', {
	set: function( property )
	{
		this._property = property.trim();
		this._property_path = this._property.split("/");
	},
	get: function(){
		return this._property;
	},
	enumerable: true
});

Track.prototype.configure = function( o )
{
	if(!o.property)
		console.warn("Track with property name");

	if(o.enabled !== undefined) this.enabled = o.enabled;
	if(o.name) this.name = o.name;
	if(o.property) this.property = o.property;
	if(o.type) this.type = o.type;
	if(o.looped) this.looped = o.looped;
	if(o.interpolation !== undefined)
		this.interpolation = o.interpolation;
	else
		this.interpolation = LS.LINEAR;

	if(o.data_table) this.data_table = o.data_table;

	if(o.value_size) this.value_size = o.value_size;

	//data
	if(o.data)
	{
		this.data = o.data;

		//this is ugly but makes it easy to work with the collada importer
		if(o.packed_data === undefined && this.data.constructor !== Array)
			this.packed_data = true;
		else
			this.packed_data = !!o.packed_data;

		if( o.data.constructor == Array )
		{
			if( this.packed_data )
				this.data = new Float32Array( o.data );
		}
		//else
		//	this.unpackData();
	}

	if(o.interpolation && !this.value_size)
		o.interpolation = LS.NONE;
}

Track.prototype.serialize = function()
{
	var o = {
		enabled: this.enabled,
		name: this.name,
		property: this.property, 
		type: this.type,
		interpolation: this.interpolation,
		looped: this.looped,
		value_size: this.value_size,
		packed_data: this.packed_data,
		data_table: this.data_table
	}

	if(this.data)
	{
		if(this.value_size <= 1)
			o.data = this.data.concat(); //regular array, clone it
		else //pack data
		{
			this.packData();
			o.data = new Float32Array( this.data ); //clone it
			o.packed_data = this.packed_data;
		}
	}

	return o;
}

Track.prototype.toJSON = Track.prototype.serialize;

Track.prototype.clear = function()
{
	this.data = [];
	this.packed_data = false;
}


//used to change every track so instead of using UIDs for properties it uses node names
//this is used when you want to apply the same animation to different nodes in the scene
Track.prototype.convertIDtoName = function( use_basename, root )
{
	if( !this._property_path || !this._property_path.length )
		return false;

	if(this._property_path[0][0] !== LS._uid_prefix)
		return false; //is already using names

	var node = LSQ.get( this._property_path[0], root );
	if(!node)
	{
		console.warn("convertIDtoName: node not found in LS.GlobalScene: " + this._property_path[0] );
		return false;
	}

	if(!node.name)
	{
		console.warn("convertIDtoName: node without name?");
		return false;
	}

	if(use_basename)
	{
		this._property_path[0] = node.name;
		this._property = this._property_path.join("/");
	}
	else
	{
		this._property_path[0] = node.fullname;
		this._property = this._property_path.join("/");
	}

	return true;
}

Track.prototype.addKeyframe = function( time, value, skip_replace )
{
	if(this.value_size > 1)
		value = new Float32Array( value ); //clone

	if(this.packed_data)
		this.unpackData();

	if(!this.data)
		this.data = [];

	for(var i = 0; i < this.data.length; ++i)
	{
		if(this.data[i][0] < time )
			continue;
		if(this.data[i][0] == time && !skip_replace )
			this.data[i][1] = value;
		else
			this.data.splice(i,0, [time,value]);
		return i;
	}

	this.data.push( [time,value] );
	return this.data.length - 1;
}

Track.prototype.getKeyframe = function( index )
{
	if(index < 0 || index >= this.data.length)
	{
		console.warn("keyframe index out of bounds");
		return null;
	}

	if(this.packed_data)
	{
		var pos = index * (1 + this.value_size );
		if(pos > (this.data.length - this.value_size) )
			return null;
		return [ this.data[pos], this.data.subarray(pos+1, pos+this.value_size+1) ];
		//return this.data.subarray(pos, pos+this.value_size+1) ];
	}

	return this.data[ index ];
}

Track.prototype.getKeyframeByTime = function( time )
{
	var index = this.findTimeIndex( time );
	if(index == -1)
		return;
	return this.getKeyframe( index );
}


Track.prototype.moveKeyframe = function(index, new_time)
{
	if(this.packed_data)
	{
		//TODO
		console.warn("Cannot move keyframes if packed");
		return -1;
	}

	if(index < 0 || index >= this.data.length)
	{
		console.warn("keyframe index out of bounds");
		return -1;
	}

	var new_index = this.findTimeIndex( new_time );
	var keyframe = this.data[ index ];
	var old_time = keyframe[0];
	if(old_time == new_time)
		return index;
	keyframe[0] = new_time; //set time
	if(old_time > new_time)
		new_index += 1;
	if(index == new_index)
	{
		//console.warn("same index");
		return index;
	}

	//extract
	this.data.splice(index, 1);
	//reinsert
	index = this.addKeyframe( keyframe[0], keyframe[1], true );

	this.sortKeyframes();
	return index;
}

//solve bugs
Track.prototype.sortKeyframes = function()
{
	if(this.packed_data)
	{
		this.unpackData();
		this.sortKeyframes();
		this.packData();
	}
	this.data.sort( function(a,b){ return a[0] - b[0];  });
}

Track.prototype.removeKeyframe = function(index)
{
	if(this.packed_data)
		this.unpackData();

	if(index < 0 || index >= this.data.length)
	{
		console.warn("keyframe index out of bounds");
		return;
	}

	this.data.splice(index, 1);
}


Track.prototype.getNumberOfKeyframes = function()
{
	if(!this.data || this.data.length == 0)
		return 0;

	if(this.packed_data)
		return this.data.length / (1 + this.value_size );
	return this.data.length;
}

//check for the last sample time
Track.prototype.computeDuration = function()
{
	if(!this.data || this.data.length == 0)
		return 0;

	if(this.packed_data)
	{
		var time = this.data[ this.data.length - 2 - this.value_size ];
		this.duration = time;
		return time;
	}

	//not typed
	var last = this.data[ this.data.length - 1 ];
	if(last)
		return last[0];
	return 0;
}

Track.prototype.isInterpolable = function()
{
	if( this.value_size > 0 || LS.Interpolators[ this.type ] )
		return true;
	return false;
}

//better for reading
Track.prototype.packData = function()
{
	if(!this.data || this.data.length == 0)
		return 0;

	if(this.packed_data)
		return;

	if(this.value_size == 0)
		return; //cannot be packed (bools and strings cannot be packed)

	var offset = this.value_size + 1;
	var data = this.data;
	var typed_data = new Float32Array( data.length * offset );

	for(var i = 0; i < data.length; ++i)
	{
		typed_data[i*offset] = data[i][0];
		if( this.value_size == 1 )
			typed_data[i*offset+1] = data[i][1];
		else
			typed_data.set( data[i][1], i*offset+1 );
	}

	this.data = typed_data;
	this.packed_data = true;
}

//better for writing
Track.prototype.unpackData = function()
{
	if(!this.data || this.data.length == 0)
		return 0;

	if(!this.packed_data)
		return;

	var offset = this.value_size + 1;
	var typed_data = this.data;
	var data = Array( typed_data.length / offset );

	for(var i = 0; i < typed_data.length; i += offset )
		data[i/offset] = [ typed_data[i], typed_data.subarray( i+1, i+offset ) ];

	this.data = data;
	this.packed_data = false;
}

/* not tested
Track.prototype.findSampleIndex = function(time)
{
	var data = this.data;
	var offset = this.value_size + 1;
	var l = data.length;
	var n = l / offset;
	var imin = 0;
	var imax = n;
	var imid = 0;

	//dichotimic search
	// continue searching while [imin,imax] is not empty
	while (imax >= imin)
	{
		// calculate the midpoint for roughly equal partition
		imid = (((imax - imin)*0.5)|0) + imin;
		var v = data[ imid * offset ];
		if( v == time )
			return imid * offset; 
			// determine which subarray to search
		else if (v < key)
			// change min index to search upper subarray
			imin = imid + 1;
		else         
			// change max index to search lower subarray
			imax = imid - 1;
	}

	return imid * offset;
}
*/

//TODO: IMPROVE WITH DICOTOMIC SEARCH
//Returns the index of the last sample with a time less or equal to time
Track.prototype.findTimeIndex = function( time )
{
	if(!this.data || this.data.length == 0)
		return -1;

	var data = this.data;
	var l = this.data.length;
	if(!l)
		return -1;
	var i = 0;
	if(this.packed_data)
	{
		var offset = this.value_size + 1;
		var last = -1;
		for(i = 0; i < l; i += offset)
		{
			var current_time = data[i];
			if(current_time < time) 
			{
				last = i;
				continue;
			}
			if(last == -1)
				return -1;
			return (last/offset); //prev sample
		}
		if(last == -1)
			return -1;
		return (last/offset);
	}
	else //unpacked data
	{
		var last = -1;
		for(i = 0; i < l; ++i )
		{
			if(time > data[i][0]) 
			{
				last = i;
				continue;
			}
			if(time == data[i][0]) 
				return i;
			if(last == -1)
				return -1;
			return last;
		}
		if(last == -1)
			return -1;
		return last;
	}

	return -1;
}

//Warning: if no result is provided the same result is reused between samples.
Track.prototype.getSample = function( time, interpolate, result )
{
	if(!this.data || this.data.length === 0)
		return undefined;

	if(this.packed_data)
		return this.getSamplePacked( time, interpolate, result);
	return this.getSampleUnpacked( time, interpolate, result);
}

Track.prototype.getSampleUnpacked = function( time, interpolate, result )
{
	time = Math.clamp( time, 0, this.duration );

	var index = this.findTimeIndex( time );
	if(index === -1)
		index = 0;

	var index_a = index;
	var index_b = index + 1;
	var data = this.data;

	interpolate = interpolate && this.interpolation && (this.value_size > 0 || LS.Interpolators[ this.type ] );

	if(!interpolate || (data.length == 1) || index_b == data.length || (index_a == 0 && this.data[0][0] > time)) //(index_b == this.data.length && !this.looped)
		return this.data[ index ][1];

	var a = data[ index_a ];
	var b = data[ index_b ];

	var t = (b[0] - time) / (b[0] - a[0]);

	if(this.interpolation === LS.LINEAR)
	{
		if(this.value_size === 0 && LS.Interpolators[ this.type ] )
		{
			var func = LS.Interpolators[ this.type ];
			var r = func( a[1], b[1], t, this._last_value );
			this._last_value = r;
			return r;
		}

		if(this.value_size == 1)
			return a[1] * t + b[1] * (1-t);

		result = result || this._result;

		if(!result || result.length != this.value_size)
			result = this._result = new Float32Array( this.value_size );

		switch(this.type)
		{
			case "quat": 
				quat.lerp( result, a[1], b[1], t );
				quat.normalize( result, result );
				break;
			case "trans10": 
				for(var i = 0; i < this.value_size; i++)
					result[i] = a[1][i] * t + b[1][i] * (1-t);
				var rotA = a[1].subarray(3,7);
				var rotB = a[1].subarray(3,7);
				var rotR = result.subarray(3,7);
				quat.lerp( rotR, rotA, rotB, t );
				quat.normalize( rotR, rotR );
				break;
			default:
				for(var i = 0; i < this.value_size; i++)
					result[i] = a[1][i] * t + b[1][i] * (1-t);
		}

		return result;
	}
	else if(this.interpolation === LS.BEZIER)
	{
		//bezier not implemented for interpolators
		if(this.value_size === 0 && LS.Interpolators[ this.type ] )
		{
			var func = LS.Interpolators[ this.type ];
			var r = func( a[1], b[1], t, this._last_value );
			this._last_value = r;
			return r;
		}

		var pre_a = index > 0 ? data[ index - 1 ] : a;
		var post_b = index < data.length - 2 ? data[ index + 2 ] : b;

		if(this.value_size === 1)
			return Animation.EvaluateHermiteSpline(a[1],b[1],pre_a[1],post_b[1], 1 - t );


		result = result || this._result;

		//multiple data
		if(!result || result.length != this.value_size)
			result = this._result = new Float32Array( this.value_size );

		result = result || this._result;
		result = Animation.EvaluateHermiteSplineVector(a[1],b[1], pre_a[1], post_b[1], 1 - t, result );

		if(this.type == "quat")
			quat.normalize(result, result);
		else if(this.type == "trans10")
		{
			var rot = result.subarray(3,7);
			quat.normalize(rot, rot);
		}

		return result;
	}

	return null;
}

Track.prototype.getSamplePacked = function( time, interpolate, result )
{
	time = Math.clamp( time, 0, this.duration );

	var index = this.findTimeIndex( time );
	if(index == -1)
		index = 0;

	var offset = (this.value_size+1);
	var index_a = index;
	var index_b = index + 1;
	var data = this.data;
	var num_keyframes = data.length / offset;

	interpolate = interpolate && this.interpolation && (this.value_size > 0 || LS.Interpolators[ this.type ] );

	if( !interpolate || num_keyframes == 1 || index_b == num_keyframes || (index_a == 0 && this.data[0] > time)) //(index_b == this.data.length && !this.looped)
		return this.getKeyframe( index )[1];

	var a = data.subarray( index_a * offset, (index_a + 1) * offset );
	var b = data.subarray( index_b * offset, (index_b + 1) * offset );

	var t = (b[0] - time) / (b[0] - a[0]);

	if(this.interpolation === LS.LINEAR)
	{
		if(this.value_size == 1)
			return a[1] * t + b[1] * (1-t);
		else if( LS.Interpolators[ this.type ] )
		{
			var func = LS.Interpolators[ this.type ];
			var r = func( a[1], b[1], t, this._last_v );
			this._last_v = r;
			return r;
		}

		result = result || this._result;

		if(!result || result.length != this.value_size)
			result = this._result = new Float32Array( this.value_size );

		switch(this.type)
		{
			case "quat": 
				quat.lerp( result, b.subarray(1,5), a.subarray(1,5), t );
				quat.normalize( result, result );
				break;
			case "trans10": 
				for(var i = 0; i < this.value_size; i++)
					result[i] = a[1+i] * t + b[1+i] * (1-t);
				var rotA = a.subarray(4,8);
				var rotB = b.subarray(4,8);
				var rotR = result.subarray(3,7);
				quat.lerp( rotR, rotB, rotA, t );
				quat.normalize( rotR, rotR );
				break;
			default:
				for(var i = 0; i < this.value_size; i++)
					result[i] = a[1+i] * t + b[1+i] * (1-t);
		}

		return result;
	}
	else if(this.interpolation === LS.BEZIER)
	{
		if( this.value_size === 0) //bezier not supported in interpolators
			return a[1];

		var pre_a = index > 0 ? data.subarray( (index-1) * offset, (index) * offset ) : a;
		var post_b = index_b < (num_keyframes - 1) ? data.subarray( (index_b+1) * offset, (index_b+2) * offset ) : b;

		if(this.value_size === 1)
			return Animation.EvaluateHermiteSpline( a[1], b[1], pre_a[1], post_b[1], 1 - t );

		result = result || this._result;

		//multiple data
		if(!result || result.length != this.value_size)
			result = this._result = new Float32Array( this.value_size );

		result = result || this._result;
		result = Animation.EvaluateHermiteSplineVector( a.subarray(1,offset), b.subarray(1,offset), pre_a.subarray(1,offset), post_b.subarray(1,offset), 1 - t, result );

		if(this.type == "quat")
			quat.normalize(result, result);
		else if(this.type == "trans10")
		{
			var rot = result.subarray(3,7);
			quat.normalize(rot, rot);
		}

		return result;
	}

	return null;
}


Track.prototype.getPropertyInfo = function()
{
	return LS.GlobalScene.getPropertyInfo( this.property );
}

Track.prototype.getSampledData = function( start_time, end_time, num_samples )
{
	var delta = (end_time - start_time) / num_samples;
	if(delta <= 0)
		return null;

	var samples = [];
	for(var i = 0; i < num_samples; ++i)
	{
		var t = i * delta + start_time;
		var sample = this.getSample( t, true );
		if(this.value_size > 1)
			sample = new sample.constructor( sample );
		samples.push(sample);
	}

	return samples;
}


Animation.Track = Track;

/*
vec3f EvaluateHermiteSpline(const vec3f& p0, const vec3f& p1, const vec3f& t0, const vec3f& t1, float s)
{
	float s2 = s * s;
	float s3 = s2 * s;
	float h1 =  2*s3 - 3*s2 + 1;          // calculate basis function 1
	float h2 = -2*s3 + 3*s2;              // calculate basis function 2
	float h3 =   s3 - 2*s2 + s;         // calculate basis function 3
	float h4 =   s3 -  s2;              // calculate basis function 4
	vec3f p = h1*p0+                    // multiply and sum all funtions
						 h2*p1 +                    // together to build the interpolated
						 h3*t0 +                    // point along the curve.
						 h4*t1;
	return p;
}
*/


Animation.EvaluateHermiteSpline = function( p0, p1, pre_p0, post_p1, s )
{
	var s2 = s * s;
	var s3 = s2 * s;
	var h1 =  2*s3 - 3*s2 + 1;          // calculate basis function 1
	var h2 = -2*s3 + 3*s2;              // calculate basis function 2
	var h3 =   s3 - 2*s2 + s;         // calculate basis function 3
	var h4 =   s3 -  s2;              // calculate basis function 4
	
	var t0 = p1 - pre_p0;
	var t1 = post_p1 - p0;

	return h1 * p0 + h2 * p1 + h3 * t0 + h4 * t1;
}

Animation.EvaluateHermiteSplineVector = function( p0, p1, pre_p0, post_p1, s, result )
{
	result = result || new Float32Array( result.length );

	var s2 = s * s;
	var s3 = s2 * s;
	var h1 =  2*s3 - 3*s2 + 1;          // calculate basis function 1
	var h2 = -2*s3 + 3*s2;              // calculate basis function 2
	var h3 =   s3 - 2*s2 + s;         // calculate basis function 3
	var h4 =   s3 -  s2;              // calculate basis function 4

	for(var i = 0; i < result.length; ++i)
	{
		var t0 = p1[i] - pre_p0[i];
		var t1 = post_p1[i] - p0[i];
		result[i] = h1 * p0[i] + h2 * p1[i] + h3 * t0 + h4 * t1;
	}

	return result;
}

LS.Interpolators = {};

LS.Interpolators["texture"] = function( a, b, t, last )
{
	var texture_a = a ? LS.getTexture( a ) : null;
	var texture_b = b ? LS.getTexture( b ) : null;

	if(a && !texture_a && a[0] != ":" )
		LS.ResourcesManager.load(a);
	if(b && !texture_b && b[0] != ":" )
		LS.ResourcesManager.load(b);

	var texture = texture_a || texture_b;

	var black = gl.textures[":black"];
	if(!black)
		black = gl.textures[":black"] = new GL.Texture(1,1, { format: gl.RGB, pixel_data: [0,0,0], filter: gl.NEAREST });

	if(!texture)
		return black;

	var w = texture ? texture.width : 256;
	var h = texture ? texture.height : 256;

	if(!texture_a)
		texture_a = black;
	if(!texture_b)
		texture_b = black;

	if(!last || last.width != w || last.height != h || last.format != texture.format )
		last = new GL.Texture( w, h, { format: texture.format, type: texture.type, filter: gl.LINEAR } );

	var shader = gl.shaders[":interpolate_texture"];
	if(!shader)
		shader = gl.shaders[":interpolate_texture"] = GL.Shader.createFX("color = mix( texture2D( u_texture_b, uv ), color , u_factor );", "uniform sampler2D u_texture_b; uniform float u_factor;" );

	gl.disable( gl.DEPTH_TEST );
	last.drawTo( function() {
		gl.clearColor(0,0,0,0);
		gl.clear( gl.COLOR_BUFFER_BIT );
		texture_b.bind(1);
		texture_a.toViewport( shader, { u_texture_b: 1, u_factor: t } );
	});

	return last;
}

function Path()
{
	this.points = [];
	this.closed = false;
	this.type = Path.LINE;
}

Path.LINE = 1;
Path.SPLINE = 2;
Path.BEZIER = 3;


Path.prototype.addPoint = function(p)
{
	var pos = vec3.create();
	pos[0] = p[0];
	pos[1] = p[1];
	if(p.length > 2)
		pos[2] = p[2];
	this.points.push( pos );
}

Path.prototype.getSegments = function()
{
	var l = this.points.length;

	switch(this.type)
	{
		case Path.LINE: 
			if(l < 2) 
				return 0;
			return l - 1; 
			break;
		case Path.SPLINE:
			if(l < 3) 
				return 0;
			return (((l-1)/3)|0); 
			break;
	}
	return 0;
}

Path.prototype.computePoint = function(f, out)
{
	switch(this.type)
	{
		case Path.LINE: return this.getLinearPoint(f,out); break;
		case Path.SPLINE: 
		default:
			return this.getSplinePoint(f,out); break;
	}
	throw("Impossible path type");
}


Path.prototype.getLinearPoint = function(f, out)
{
	out = out || vec3.create();
	var l = this.points.length;
	if(l < 2)
		return out;

	if(f <= 0)
		return vec3.copy(out, this.points[0]);
	if(f >= 1)
		return vec3.copy(out, this.points[l-1]);

	var v = ((l-1) * f);
	var i = v|0;
	var fract = v-i;
	var p = this.points[ i ];
	var p2 = this.points[ i+1 ];
	return vec3.lerp(out, p, p2, fract);
}

Path.prototype.getSplinePoint = function(f, out)
{
	out = out || vec3.create();
	var l = this.points.length;
	if(l < 4)
		return out;
	l = (((l-1)/3)|0) * 3 + 1; //take only useful points
	if(f <= 0)
		return vec3.copy(out, this.points[0]);
	if(f >= 1)
		return vec3.copy(out, this.points[l-1]);

	var v = ((l-1)/3*f); 
	var i = v|0;//spline number
	var t = v-i;//weight
	var p = this.points[ i ];
	var p1 = this.points[ i+1 ];
	var p2 = this.points[ i+2 ];
	var p3 = this.points[ i+3 ];

	var b1 = (1-t)*(1-t)*(1-t);
	var b2 = 3*t*(1-t)*(1-t);
	var b3 = 3*t*t*(1-t);
	var b4 = t*t*t;

	out[0] = p[0] * b1 + p1[0] * b2 + p2[0] * b3 + p3[0] * b4;
	out[1] = p[1] * b1 + p1[1] * b2 + p2[1] * b3 + p3[1] * b4;
	out[2] = p[2] * b1 + p1[2] * b2 + p2[2] * b3 + p3[2] * b4;
	return out;
}

/*
Path.prototype.getSplinePoint = function(f, out)
{
	out = out || vec3.create();
	var l = this.points.length;
	if(l < 4)
		return out;
	l = (((l-1)/3)|0) * 3 + 1; //take only useful points
	if(f <= 0)
		return vec3.copy(out, this.points[0]);
	if(f >= 1)
		return vec3.copy(out, this.points[l-1]);

	var v = ((l-1)/3*f); 
	var i = v|0;//spline number
	var fract = v-i;//weight
	var p = this.points[ i ];
	var p1 = this.points[ i+1 ];
	var p2 = this.points[ i+2 ];
	var p3 = this.points[ i+3 ];
	var w = fract;
	var w2 = w*w;
	var w3 = w2*w;
	out[0] = Path.interpolate( p[0], p1[0], p2[0], p3[0], w,w2,w3 );
	out[1] = Path.interpolate( p[1], p1[1], p2[1], p3[1], w,w2,w3 );
	out[2] = Path.interpolate( p[2], p1[2], p2[2], p3[2], w,w2,w3 );
	return out;
}

//catmull-rom
Path.interpolate = function ( p0, p1, p2, p3, t, t2, t3 ) {
	var v0 = ( p2 - p0 ) * 0.5;
	var v1 = ( p3 - p1 ) * 0.5;
	return ( 2 * ( p1 - p2 ) + v0 + v1 ) * t3 + ( - 3 * ( p1 - p2 ) - 2 * v0 - v1 ) * t2 + v0 * t + p1;
};

*/


Path.prototype.samplePoints = function(n)
{
	if(n <= 0)
	{
		var segments = this.getSegments();
		if(this.type == LS.Path.LINE)
			n = segments + 1;
		else
			n = segments * 20;
	}

	var result = Array(n);
	for(var i = 0; i < n; i++)
		result[i] = this.computePoint(i/(n-1));
	return result;
}


Path.prototype.serialize = function()
{
	var o = {};
	var points = Array( this.points.length * 3 );
	for(var i = 0; i < this.points.length; i++)
	{
		var p = this.points[i];
		points[i*3] = p[0];
		points[i*3+1] = p[1];
		points[i*3+2] = p[2];
	}

	o.points = points;
	o.type = this.type;
	o.closed = this.closed;
	return o;
}

Path.prototype.configure = function(o)
{
	this.type = o.type;
	this.closed = o.closed;

	if(o.points)
	{
		this.points.length = o.points.length / 3;
		var points = o.points;
		for(var i = 0; i < this.points.length; i++)
			this.points[i] = vec3.fromValues( points[i*3], points[i*3+1], points[i*3+2] );
	}
}


LS.Path = Path;

/**
* Prefab work in two ways: 
* - It can contain a node structure and all the associated resources (textures, meshes, animations, etc)
* - When a node in the scene was created from a Prefab, the prefab is loaded so the associated resources are recovered, but the node structure is not modified.
* 
* @class Prefab
* @constructor
*/

function Prefab(o)
{
	this.resource_names = []; 
	this.prefab_json = null;
	this.prefab_data = null; //json object
	this._resources_data = {}; //data as it was loaded from the WBin

	if(o)
		this.configure(o);
}

Prefab.version = "0.2"; //used to know where the file comes from 

/**
* configure the prefab
* @method configure
* @param {*} data
**/

Prefab.prototype.configure = function(data)
{
	if(!data)
		throw("No prefab data found");

	if(data.hasOwnProperty("prefab_data"))
	{
		this.prefab_data = data.prefab_data;
		this.prefab_json = data.prefab_json || JSON.stringify( this.prefab_data );
	}
	else
	{
		//read from WBin info
		var prefab_json = data["@json"];
		if(!prefab_json)
		{
			console.warn("No JSON found in prefab");
			return;
		}

		var version = data["@version"]; //not used yet
		this.prefab_json = prefab_json;
		this.prefab_data = JSON.parse( prefab_json );
	}

	this.resource_names = data["@resources_name"] || data.resource_names;

	//extract resource names
	if(this.resource_names)
	{
		var resources = {};
		for(var i in this.resource_names)
		{
			if(!version) //legacy
				resources[ this.resource_names[i] ] = data[ this.resource_names[i] ];
			else
				resources[ this.resource_names[i] ] = data[ "@RES_" + i ];
		}
		this._resources_data = resources;
	}

	//store resources in ResourcesManager
	this.processResources();
}

Prefab.fromBinary = function(data)
{
	if(data.constructor == ArrayBuffer)
		data = WBin.load(data, true);

	return new LS.Prefab(data);
}

//given a list of resources that come from a Prefab (usually a wbin) it extracts, process and register them 
Prefab.prototype.processResources = function()
{
	if(!this._resources_data)
		return;

	var resources = this._resources_data;

	//block this resources of being loaded, this is to avoid chain reactions when a resource uses 
	//another one contained in this Prefab
	for(var resname in resources)
	{
		if( LS.ResourcesManager.resources[ resname ] )
			continue; //already loaded
		LS.ResourcesManager.resources_being_processed[ resname ] = true;
	}

	//process and store in ResourcesManager
	for(var resname in resources)
	{
		if( LS.ResourcesManager.resources[resname] )
			continue; //already loaded

		var resdata = resources[resname];
		if(!resdata)
		{
			console.warn("resource data in prefab is undefined, skipping it:" + resname);
			continue;
		}
		var resource = LS.ResourcesManager.processResource( resname, resdata, { is_local: true, from_prefab: true } );
	}
}

/**
* Creates an instance of the object inside the prefab
* @method createObject
* @return object contained 
**/

Prefab.prototype.createObject = function()
{
	if(!this.prefab_json)
		throw("No prefab_json data found");

	var conf_data = JSON.parse(this.prefab_json);

	if(!conf_data)
	{
		console.error("Prefab data is null");
		return null;
	}

	var node = new LS.SceneNode();
	node.configure(conf_data);
	LS.ResourcesManager.loadResources( node.getResources({},true) );

	if(this.fullpath)
		node.prefab = this.fullpath;

	return node;
}

/**
* to create a new prefab, it packs all the data an instantiates the resource
* @method Prefab.createPrefab
* @param {String} filename a name for this prefab (if wbin is not appended, it will)
* @param {Object} node_data an object containing all the node data to store
* @param {Array} resource_names_list an array with the name of the resources to store
* @return object containing the prefab data ready to be converted to WBin (it also stores _original_data with the WBin)
**/
Prefab.createPrefab = function( filename, node_data, resource_names_list )
{
	if(!filename)
		return;

	if(!node_data)
		throw("No node_data in prefab");

	filename = filename.replace(/ /gi,"_");
	resource_names_list = resource_names_list || [];

	//LS.clearUIds( node_data ); //remove uids of nodes and components
	node_data.object_type = "SceneNode";

	var prefab = new LS.Prefab();
	var ext = LS.ResourcesManager.getExtension(filename);
	if(ext != "wbin")
		filename += ".wbin";

	//checkfilenames and rename them to short names
	prefab.filename = filename;
	prefab.resource_names = resource_names_list;
	prefab.prefab_data = node_data;
	prefab.prefab_json = JSON.stringify( prefab.prefab_data );

	//get all the resources and store them in a WBin
	var bindata = LS.Prefab.packResources( resource_names_list, { "@json": prefab.prefab_json, "@version": Prefab.version } );
	prefab._original_data = bindata;

	return prefab;
}

//Given a list of resources and some base data, it creates a WBin with all the data
Prefab.packResources = function( resource_names_list, base_data )
{
	var to_binary = base_data || {};
	var resource_names = [];

	if(resource_names_list && resource_names_list.length)
	{
		for(var i = 0; i < resource_names_list.length; ++i)
		{
			var res_name = resource_names_list[i];
			var resource = LS.ResourcesManager.resources[ res_name ];
			if(!resource)
				continue;

			var data = null;
			if(resource._original_data) //must be string or bytes
				data = resource._original_data;
			else
			{
				var data_info = LS.Resource.getDataToStore( resource );
				data = data_info.data;
			}

			if(!data)
			{
				console.warning("Wrong data in resource");
				continue;
			}

			if(data.constructor === Blob || data.constructor === File)
			{
				console.warning("WBin does not support to store File or Blob, please convert to ArrayBuffer using FileReader");
				continue;
			}

			to_binary["@RES_" + resource_names.length ] = data;
			resource_names.push( res_name );
		}
	}

	to_binary["@resources_name"] = resource_names;
	return WBin.create( to_binary, "Prefab" );
}

Prefab.prototype.updateFromNode = function( node, clear_uids )
{
	var data = node.serialize(true);
	if(clear_uids)
		LS.clearUIds(data); //remove UIDs
	this.prefab_data = data;
	this.prefab_json = JSON.stringify( data );
}

Prefab.prototype.flagResources = function()
{
	if(!this.resource_names)
		return;

	for(var i = 0; i < this.resource_names.length; ++i)
	{
		var res_name = this.resource_names[i];
		var resource = LS.ResourcesManager.resources[ res_name ];
		if(!resource)
			continue;

		resource.from_prefab = this.fullpath || this.filename || true;
	}
}

Prefab.prototype.setResourcesLink = function( value )
{
	for(var i = 0; i < this.resource_names.length; ++i)
	{
		var res_name = this.resource_names[i];
		var resource = LS.ResourcesManager.resources[ res_name ];
		if(!resource)
			continue;
		if(value)
			resource.from_prefab = value;
		else
			delete resource.from_prefab;
	}
}

//search for nodes using this prefab and creates the nodes
Prefab.prototype.applyToNodes = function( scene )
{
	scene = scene || LS.GlobalScene;	
	var name = this.fullpath || this.filename;

	for(var i = 0; i < scene._nodes.length; ++i)
	{
		var node = scene._nodes[i];
		if(node.prefab != name)
			continue;
		node.reloadFromPrefab();
	}
}

Prefab.prototype.getDataToStore = function()
{
	this.prefab_json = JSON.stringify( this.prefab_data );
	return LS.Prefab.packResources( this.resource_names, { "@json": this.prefab_json, "@version": LS.Prefab.version } );
}

LS.Classes["Prefab"] = LS.Prefab = Prefab;


/**
* Pack is an object that contain several resources, helpful when you want to carry a whole scene in one single file
* 
* @class Pack
* @constructor
*/

function Pack(o)
{
	this.resource_names = []; 
	this.metadata = {};
	this._resources_data = {};
	if(o)
		this.configure(o);
}

Pack.version = "0.2"; //used to know where the file comes from 

/**
* configure the pack from an unpacked WBin
* @method configure
* @param {*} data
**/
Pack.prototype.configure = function( data )
{
	var version = data["@version"];
	var metadata = data["@metadata"];
	if(metadata)
		this.metadata = metadata.constructor === String ? JSON.parse( metadata ) : metadata;

	//extract resource names
	this.resource_names = data["@resource_names"];
	this._resources_data = {};
	if(this.resource_names)
	{
		for(var i in this.resource_names)
			this._resources_data[ this.resource_names[i] ] = data[ "@RES_" + i ];
	}

	//store resources in LS.ResourcesManager
	this.processResources();
}

Pack.fromBinary = function(data)
{
	if(data.constructor == ArrayBuffer)
		data = WBin.load(data, true);
	return new LS.Pack(data);
}

//given a list of resources that come from the Pack (usually a wbin) it extracts, process and register them 
Pack.prototype.processResources = function()
{
	if(!this.resource_names)
		return;

	//block this resources of being loaded, this is to avoid chain reactions when a resource uses 
	//another one contained in this pack
	for(var i = 0; i < this.resource_names.length; ++i)
	{
		var resname = this.resource_names[i];
		if( LS.ResourcesManager.resources[ resname ] )
			continue; //already loaded
		LS.ResourcesManager.resources_being_processed[ resname ] = true;
	}

	//process and store in LS.ResourcesManager
	for(var i = 0; i < this.resource_names.length; ++i)
	{
		var resname = this.resource_names[i];
		if( LS.ResourcesManager.resources[resname] )
			continue; //already loaded

		var resdata = this._resources_data[ resname ];
		if(!resdata)
		{
			console.warn("resource data in Pack is undefined, skipping it:" + resname);
			continue;
		}
		var resource = LS.ResourcesManager.processResource( resname, resdata, { is_local: true, from_pack: true } );
	}
}

Pack.prototype.setResources = function( resource_names, mark_them )
{
	this.resource_names = [];
	this._resources_data = {};

	//get resources
	for(var i = 0; i < resource_names.length; ++i)
	{
		var res_name = resource_names[i];
		if(this.resource_names.indexOf(res_name) != -1)
			continue;
		var resource = LS.ResourcesManager.resources[ res_name ];
		if(!resource)
			continue;
		if(mark_them)
			resource.from_pack = true;
		this.resource_names.push( res_name );
	}

	//repack the pack info
	this._original_data = LS.Pack.packResources( resource_names, { "@metadata": JSON.stringify( this.metadata ), "@version": LS.Pack.version } );
	this._modified = true;
}

Pack.prototype.setResourcesLink = function( value )
{
	for(var i = 0; i < this.resource_names.length; ++i)
	{
		var res_name = this.resource_names[i];
		var resource = LS.ResourcesManager.resources[ res_name ];
		if(!resource)
			continue;
		if(value)
			resource.from_pack = value;
		else
			delete resource.from_pack;
	}
}

Pack.prototype.addResources = function( resource_names, mark_them )
{
	this.setResources( this.resource_names.concat( resource_names ), mark_them );
}

/**
* to create a WBin containing all the resource and metadata
* @method Pack.createWBin
* @param {String} fullpath for the pack
* @param {Array} resource_names array with the names of all the resources to store
* @param {Object} metadata [optional] extra data to store
* @param {boolean} mark_them [optional] marks all the resources as if they come from a pack
* @return object containing the pack data ready to be converted to WBin
**/
Pack.createPack = function( filename, resource_names, metadata, mark_them )
{
	if(!filename)
		return;

	if(!resource_names || resource_names.constructor !== Array)
		throw("Pack.createPack resources must be array with names");

	filename = filename.replace(/ /gi,"_");

	var pack = new LS.Pack();
	filename += ".wbin";
	pack.filename = filename;
	if(metadata)
		pack.metadata = metadata;
	var metadata_json = JSON.stringify( pack.metadata );

	pack.resource_names = resource_names;
	for(var i = 0; i < resource_names.length; ++i)
	{
		var res_name = resource_names[i];
		var resource = LS.ResourcesManager.resources[ res_name ];
		if(!resource)
			continue;
		if(mark_them)
			resource.from_pack = true;
	}

	//create the WBIN in case this pack gets stored
	var bindata = LS.Pack.packResources( resource_names, { "@metadata": metadata_json, "@version": LS.Pack.version } );
	pack._original_data = bindata;

	return pack;
}

//Given a bunch of resource names it creates a WBin with all inside
Pack.packResources = function( resource_names, base_object )
{
	var to_binary = base_object || {};
	var final_resource_names = [];

	for(var i = 0; i < resource_names.length; ++i)
	{
		var res_name = resource_names[i];
		var resource = LS.ResourcesManager.resources[ res_name ];
		if(!resource)
			continue;

		var data = null;
		if(resource._original_data) //must be string or bytes
			data = resource._original_data;
		else
		{
			var data_info = LS.Resource.getDataToStore( resource );
			data = data_info.data;
		}

		if(!data)
		{
			console.warning("Wrong data in resource");
			continue;
		}

		if(data.constructor === Blob || data.constructor === File)
		{
			console.warning("WBin does not support to store File or Blob, please, use ArrayBuffer");
			continue;
		}

		to_binary["@RES_" + final_resource_names.length ] = data;
		final_resource_names.push( res_name );
		//to_binary[res_name] = data;
	}

	to_binary["@resource_names"] = final_resource_names;
	return WBin.create( to_binary, "Pack" );
}

//just tells the resources where they come from, we cannot do that before because we didnt have the name of the pack
Pack.prototype.flagResources = function()
{
	if(!this.resource_names)
		return;

	for(var i = 0; i < this.resource_names.length; ++i)
	{
		var res_name = this.resource_names[i];
		var resource = LS.ResourcesManager.resources[ res_name ];
		if(!resource)
			continue;

		resource.from_pack = this.fullpath || this.filename || true;
	}
}

LS.Classes["Pack"] = LS.Pack = Pack;

//Work in progress

/**
* helps apply basic effects to a texture with as fewer render calls as possible with low memory footprint
* used by CameraFX but also available for any other use
* @class TextureFX
*/
function TextureFX( o )
{
	this.apply_fxaa = false;
	this.fx = [];

	this._uniforms = { u_aspect: 1, u_viewport: vec2.create(), u_iviewport: vec2.create(), u_texture: 0, u_texture_depth: 1, u_random: vec2.create() };
	if(o)
		this.configure(o);
}

TextureFX.available_fx = {
	"brightness_contrast": {
		name: "Brightness & Contrast",
		uniforms: {
			brightness: { name: "u_brightness", type: "float", value: 1, step: 0.01 },
			contrast: { name: "u_contrast", type: "float", value: 1, step: 0.01 }
		},
		code:"color.xyz = (color.xyz * u_brightness@ - vec3(0.5)) * u_contrast@ + vec3(0.5);"
	},
	"invert": {
		name: "Invert color",
		code:"color.xyz = vec3(1.0) - color.xyz;"
	},
	"threshold": {
		name: "Threshold",
		uniforms: {
			threshold: { name: "u_threshold", type: "float", value: 0.5, min: 0, max: 2, step: 0.01 },
			threshold_width: { name: "u_threshold_width", type: "float", value: 0.01, min: 0, max: 1, step: 0.001 }
		},
		code:"color.xyz = vec3( smoothstep( u_threshold@ - u_threshold_width@ * 0.5, u_threshold@ + u_threshold_width@ * 0.5,  length(color.xyz) ));"
	},
	"colorize": {
		name: "Colorize",
		uniforms: {
			colorize: { name: "u_colorize", type: "color3", value: [1,1,1] },
			vibrance: { name: "u_vibrance", type: "float", value: 0.0, min: 0, max: 2, step: 0.01 }
		},
		code:"color.xyz = color.xyz * (u_colorize@ + vec3(u_vibrance@ * 0.1)) * (1.0 + u_vibrance@);"
	},
	"color_add": {
		name: "Color add",
		uniforms: {
			color_add: { name: "u_coloradd", type: "color3", value: [0.1,0.1,0.1] }
		},
		code:"color.xyz = color.xyz + u_coloradd@;"
	},
	"vigneting": {
		name: "Vigneting",
		uniforms: {
			radius: { name: "u_radius", type: "float", value: 1 },
			intensity: { name: "u_vigneting", type: "float", value: 1, min: 0, max: 2, step: 0.01 }
		},
		code:"color.xyz = mix( color.xyz * max( 1.0 - (dist_to_center * u_radius@ / 0.7071), 0.0), color.xyz, u_vigneting@);"
	},
	"aberration": {
		name: "Chromatic Aberration",
		pass: "before",
		uniforms: {
			difraction: { name: "u_difraction", type: "float", value: 1 }
		},
		code: "color.x = texture2D(u_texture, uv - to_center * 0.001 * u_difraction@ ).x;" + 
			"color.z = texture2D(u_texture, uv + to_center * 0.001 * u_difraction@ ).z;"
	},
	"halftone": {
		name: "Halftone",
		uniforms: {
			"Halftone angle": { name: "u_halftone_angle", type: "float", value: 0, step: 0.01 },
			"Halftone size": { name: "u_halftone_size", type: "float", value: 1, step: 0.01 }
		},
		functions: ["pattern"],
		code:"color.x = ( (color.x * 10.0 - 5.0) + pattern( u_halftone_angle@, u_halftone_size@ ) );" + 
			"color.y = ( (color.y * 10.0 - 5.0) + pattern( u_halftone_angle@ + 0.167, u_halftone_size@ ) );" + 
			"color.z = ( (color.z * 10.0 - 5.0) + pattern( u_halftone_angle@ + 0.333, u_halftone_size@ ) );"
	},
	"halftoneBN": {
		name: "Halftone B/N",
		uniforms: {
			"Halftone angle": { name: "u_halftone_angle", type: "float", value: 0, step: 0.01 },
			"Halftone size": { name: "u_halftone_size", type: "float", value: 1, step: 0.01 }
		},
		functions: ["pattern"],
		code:"color.xyz = vec3( (length(color.xyz) * 10.0 - 5.0) + pattern( u_halftone_angle@, u_halftone_size@ ) );"
	},
	"lens": {
		name: "Lens Distortion",
		uniforms: {
			lens_k: { name: "u_lens_k", type: "float", value: -0.15 },
			lens_kcube: { name: "u_lens_kcube", type: "float", value: 0.8 },
			lens_scale: { name: "u_lens_scale", type: "float", value: 1 }
		},
		uv_code:"float r2 = u_aspect * u_aspect * (uv.x-0.5) * (uv.x-0.5) + (uv.y-0.5) * (uv.y-0.5); float distort@ = 1. + r2 * (u_lens_k@ + u_lens_kcube@ * sqrt(r2)); uv = vec2( u_lens_scale@ * distort@ * (uv.x-0.5) + 0.5, u_lens_scale@  * distort@ * (uv.y-0.5) + 0.5 );"
	},
	"warp": {
		name: "Warp",
		uniforms: {
			warp_amp: { name: "u_warp_amp", type: "float", value: 0.01, step: 0.001 },
			warp_texture: { name: "u_warp_texture", type: "sampler2D", widget: "Texture", value: "" }
		},
		uv_code:"uv = uv + u_warp_amp@ * (texture2D( u_warp_texture@, uv ).xy - vec2(0.5));"
		//uv_code:"uv = uv + u_warp_amp@ * (vec2(0.5) + 0.5 * vec2( sin(uv.x * u_warp_freq@) * sin(uv.y * u_warp_freq@)));"
	},
	"LUT": {
		name: "LUT",
		functions: ["LUT"],
		uniforms: {
			lut_intensity: { name: "u_lut_intensity", type: "float", value: 1, step: 0.01 },
			lut_texture: { name: "u_lut_texture", type: "sampler2D", filter: "nearest", wrap: "clamp", widget: "Texture", value: "" }
		},
		code:"color.xyz = mix(color.xyz, LUT( color.xyz, u_lut_texture@ ), u_lut_intensity@);"
		//uv_code:"uv = uv + u_warp_amp@ * (vec2(0.5) + 0.5 * vec2( sin(uv.x * u_warp_freq@) * sin(uv.y * u_warp_freq@)));"
	},
	"pixelate": {
		name: "Pixelate",
		uniforms: {
			width: { name: "u_width", type: "float", value: 256, step: 1, min: 1 },
			height: { name: "u_height", type: "float", value: 256, step: 1, min: 1 }
		},
		uv_code:"uv = vec2( floor(uv.x * u_width@) / u_width@, floor(uv.y * u_height@) / u_height@ );"
	},
	"quantize": {
		name: "Quantize",
		uniforms: {
			levels: { name: "u_levels", type: "float", value: 8, step: 1, min: 1 }
		},
		code:"color.xyz = floor(color.xyz * u_levels@) / u_levels@;"
	},
	"edges": {
		name: "Edges",
		uniforms: {
			"Edges factor": { name: "u_edges_factor", type: "float", value: 1 }
		},
		code:"vec4 color@ = texture2D(u_texture, uv );\n\
				vec4 color_up@ = texture2D(u_texture, uv + vec2(0., u_iviewport.y));\n\
				vec4 color_right@ = texture2D(u_texture, uv + vec2(u_iviewport.x,0.));\n\
				vec4 color_down@ = texture2D(u_texture, uv + vec2(0., -u_iviewport.y));\n\
				vec4 color_left@ = texture2D(u_texture, uv + vec2(-u_iviewport.x,0.));\n\
				color = u_edges_factor@ * (abs(color@ - color_up@) + abs(color@ - color_down@) + abs(color@ - color_left@) + abs(color@ - color_right@));"
	},
	"depth": {
		name: "Depth",
		uniforms: {
			"near": { name: "u_near", type: "float", value: 0.01, step: 0.1 },
			"far": { name: "u_far", type: "float", value: 1000, step: 1 }
		},
		code:"color.xyz = vec3( (2.0 * u_near@) / (u_far@ + u_near@ - texture2D(u_texture_depth, uv ).x * (u_far@ - u_near@)) );"
	},
	"logarithmic": {
		name: "Logarithmic",
		uniforms: {
			"Log. A Factor": { name: "u_logfactor_a", type: "float", value: 2, step: 0.01 },
			"Log. B Factor": { name: "u_logfactor_b", type: "float", value: 2, step: 0.01 }
		},
		code:"color.xyz = log( color.xyz * u_logfactor_a@ ) * u_logfactor_b@;"
	},
	"ditherBN": {
		name: "dither B/N",
		functions: ["dither"],
		uniforms: {
		},
		code:"color.xyz = vec3( dither( color.x ) );"
	},
	"dither": {
		name: "Dither",
		functions: ["dither"],
		uniforms: {
		},
		code:"color.xyz = vec3( dither( color.x ), dither( color.y ), dither( color.z ) );"
	},
	"gamma": {
		name: "Gamma",
		uniforms: {
			"Gamma": { name: "u_gamma", type: "float", value: 2.2, step: 0.01 }
		},
		code:"color.xyz = pow( color.xyz, vec3( 1.0 / u_gamma@) );"
	},
	"noiseBN": {
		name: "Noise B&N",
		functions: ["noise"],
		uniforms: {
			"noise": { name: "u_noise", type: "float", value: 0.1, step: 0.01 }
		},
		code:"color.xyz += u_noise@ * vec3( noise( (u_random + v_coord) * u_viewport) );"
	}
	/*
	,
	"fast_edges": {
		name: "Edges (fast)",
		code:"color.xyz = abs( dFdx(color.xyz) ) + abs( dFdy(color.xyz) );"
	}
	*/
};

TextureFX.available_functions = {
	pattern: "float pattern(float angle, float size) {\n\
				float s = sin(angle * 3.1415), c = cos(angle * 3.1415);\n\
				vec2 tex = v_coord * u_viewport.xy;\n\
				vec2 point = vec2( c * tex.x - s * tex.y , s * tex.x + c * tex.y ) * size;\n\
				return (sin(point.x) * sin(point.y)) * 4.0;\n\
			}\n\
		",
	dither: "float dither(float v) {\n\
				vec2 pixel = v_coord * u_viewport;\n\
				int i = int(floor(clamp(v,0.0,1.0) * 16.0 + 0.5));\n\
				if(i < 1)\n\
					return 0.0;\n\
				if(i >= 15)\n\
					return 1.0;\n\
				float x = floor(pixel.x);\n\
				float y = floor(pixel.y);\n\
				bool xmod4 = mod(x, 4.0) == 0.0;\n\
				bool ymod4 = mod(y, 4.0) == 0.0;\n\
				bool xmod2 = mod(x, 2.0) == 0.0;\n\
				bool ymod2 = mod(y, 2.0) == 0.0;\n\
				bool xmod4_2 = mod(x + 2.0, 4.0) == 0.0;\n\
				bool ymod4_2 = mod(y + 2.0, 4.0) == 0.0;\n\
				bool xmod2_1 = mod(x + 1.0, 2.0) == 0.0;\n\
				bool ymod2_1 = mod(y + 1.0, 2.0) == 0.0;\n\
				bool xmod4_1 = mod(x + 1.0, 4.0) == 0.0;\n\
				bool ymod4_1 = mod(y + 1.0, 4.0) == 0.0;\n\
				bool xmod4_3 = mod(x + 3.0, 4.0) == 0.0;\n\
				bool ymod4_3 = mod(y + 3.0, 4.0) == 0.0;\n\
				\n\
				if(i < 9)\n\
				{\n\
					if(i >= 1 && xmod4 && ymod4 )\n\
						return 1.0;\n\
					if(i >= 2 && xmod4_2 && ymod4_2)\n\
						return 1.0;\n\
					if(i >= 3 && xmod4_2 && ymod2 )\n\
						return 1.0;\n\
					if(i >= 4 && xmod2 && ymod2 )\n\
						return 1.0;\n\
					if(i >= 5 && xmod4_1 && ymod4_1 )\n\
						return 1.0;\n\
					if(i >= 6 && xmod4_3 && ymod4_3 )\n\
						return 1.0;\n\
					if(i >= 7 && xmod4_1 && ymod4_3 )\n\
						return 1.0;\n\
					if(i >= 8 && xmod4_3 && ymod4_1 )\n\
						return 1.0;\n\
					return 0.0;\n\
				}\n\
				else\n\
				{\n\
					if(i < 15 && xmod4_1 && ymod4 )\n\
						return 0.0;\n\
					if(i < 14 && xmod4_3 && ymod4_2)\n\
						return 0.0;\n\
					if(i < 13 && xmod4_3 && ymod2 )\n\
						return 0.0;\n\
					if(i < 12 && xmod2_1 && ymod2 )\n\
						return 0.0;\n\
					if(i < 11 && xmod4_2 && ymod4_1 )\n\
						return 0.0;\n\
					if(i < 10 && xmod4 && ymod4_3 )\n\
						return 0.0;\n\
					return 1.0;\n\
				}\n\
			}\n\
		",
	LUT:  "vec3 LUT(in vec3 color, in sampler2D textureB) {\n\
		 lowp vec3 textureColor = clamp( color, vec3(0.0), vec3(1.0) );\n\
		 mediump float blueColor = textureColor.b * 63.0;\n\
		 mediump vec2 quad1;\n\
		 quad1.y = floor(floor(blueColor) / 8.0);\n\
		 quad1.x = floor(blueColor) - (quad1.y * 8.0);\n\
		 mediump vec2 quad2;\n\
		 quad2.y = floor(ceil(blueColor) / 8.0);\n\
		 quad2.x = ceil(blueColor) - (quad2.y * 8.0);\n\
		 highp vec2 texPos1;\n\
		 texPos1.x = (quad1.x * 0.125) + 0.5/512.0 + ((0.125 - 1.0/512.0) * textureColor.r);\n\
		 texPos1.y = 1.0 - ((quad1.y * 0.125) + 0.5/512.0 + ((0.125 - 1.0/512.0) * textureColor.g));\n\
		 highp vec2 texPos2;\n\
		 texPos2.x = (quad2.x * 0.125) + 0.5/512.0 + ((0.125 - 1.0/512.0) * textureColor.r);\n\
		 texPos2.y = 1.0 - ((quad2.y * 0.125) + 0.5/512.0 + ((0.125 - 1.0/512.0) * textureColor.g));\n\
		 lowp vec3 newColor1 = texture2D(textureB, texPos1).xyz;\n\
		 lowp vec3 newColor2 = texture2D(textureB, texPos2).xyz;\n\
		 lowp vec3 newColor = mix(newColor1, newColor2, fract(blueColor));\n\
		 return newColor.rgb;\n\
	 }",
	noise:  "\n\
		float hash(float n) { return fract(sin(n) * 1e4); }\n\
		float hash(vec2 p) { return fract(1e4 * sin(17.0 * p.x + p.y * 0.1) * (0.1 + abs(sin(p.y * 13.0 + p.x)))); }\n\
		float noise(float x) {\n\
			float i = floor(x);\n\
			float f = fract(x);\n\
			float u = f * f * (3.0 - 2.0 * f);\n\
			return mix(hash(i), hash(i + 1.0), u);\n\
		}\n\
		float noise(vec2 x) {\n\
			vec2 i = floor(x);\n\
			vec2 f = fract(x);\n\
			float a = hash(i);\n\
			float b = hash(i + vec2(1.0, 0.0));\n\
			float c = hash(i + vec2(0.0, 1.0));\n\
			float d = hash(i + vec2(1.0, 1.0));\n\
			vec2 u = f * f * (3.0 - 2.0 * f);\n\
			return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;\n\
		}\n\
	"
}

/**
* Returns the first component of this container that is of the same class
* @method configure
* @param {Object} o object with the configuration info from a previous serialization
*/
TextureFX.prototype.configure = function(o)
{
	this.apply_fxaa = !!o.apply_fxaa;
	if(o.fx)
		this.fx = o.fx.concat();
}

TextureFX.prototype.serialize = function()
{
	return { 
		apply_fxaa: this.apply_fxaa,
		fx: this.fx.concat()
	};
}

TextureFX.prototype.getResources = function(res)
{
	//TODO
	return res;
}

TextureFX.prototype.addFX = function( name )
{
	if(!name)
		return;
	if( !TextureFX.available_fx[ name ] )
	{
		console.warn( "TextureFX not found: " + name );
		return;
	}
	this.fx.push({ name: name });
}

TextureFX.prototype.getFX = function(index)
{
	return this.fx[ index ];
}

TextureFX.prototype.moveFX = function( fx, offset )
{
	offset = offset || -1;

	var index = this.fx.indexOf(fx);
	if( index == -1 )
		return;

	this.fx.splice(index,1);
	index += offset;


	if(index >= 0 && index < this.fx.length)
		this.fx.splice(index,0,fx);
	else
		this.fx.push(fx);
}

TextureFX.prototype.removeFX = function( fx )
{
	for(var i = 0; i < this.fx.length; i++)
	{
		if(this.fx[i] !== fx)
			continue;

		this.fx.splice(i,1);
		return;
	}
}

TextureFX.prototype.applyFX = function( input_texture, output_texture, options )
{
	var color_texture = input_texture;
	var depth_texture = options.depth_texture;

	var fxs = this.fx;

	//shadercode: TODO, do this in a lazy way
	var key = "";
	var update_shader = true;
	for(var i = 0; i < fxs.length; i++)
		key += fxs[i].name + "|";
	if(key == this._last_shader_key)
		update_shader = false;
	this._last_shader_key = key;

	var uv_code = "";
	var color_code = "";
	var included_functions = {};
	var uniforms_code = "";
	var texture_slot = 2;

	var uniforms = this._uniforms;
	uniforms.u_viewport[0] = color_texture.width;
	uniforms.u_viewport[1] = color_texture.height;
	uniforms.u_iviewport[0] = 1 / color_texture.width;
	uniforms.u_iviewport[1] = 1 / color_texture.height;
	uniforms.u_aspect = color_texture.width / color_texture.height;
	uniforms.u_random[0] = Math.random();
	uniforms.u_random[1] = Math.random();

	var fx_id = 0;
	for(var i = 0; i < fxs.length; i++)
	{
		var fx = fxs[i];
		fx_id = i;
		var fx_info = TextureFX.available_fx[ fx.name ];
		if(!fx_info)
			continue;
		if(update_shader)
		{
			if(fx_info.functions)
				for(var z in fx_info.functions)
					included_functions[ fx_info.functions[z] ] = true;
			if( fx_info.code )
				color_code += fx_info.code.split("@").join( fx_id ) + ";\n";
			if( fx_info.uv_code )
				uv_code += fx_info.uv_code.split("@").join( fx_id ) + ";\n";
		}
		if(fx_info.uniforms)
			for(var j in fx_info.uniforms)
			{
				var uniform = fx_info.uniforms[j];
				var varname = uniform.name + fx_id;
				if(update_shader)
				{
					uniforms_code += "uniform " + uniform.type + " " + varname + ";\n";
				}

				if(uniform.type == "sampler2D")
				{
					uniforms[ varname ] = texture_slot;
					var tex = this.getTexture( fx[j] );
					if(tex)
					{
						tex.bind( texture_slot );
						if(uniform.filter == "nearest")
						{
							gl.texParameteri( tex.texture_type, gl.TEXTURE_MAG_FILTER, gl.NEAREST );
							gl.texParameteri( tex.texture_type, gl.TEXTURE_MIN_FILTER, gl.NEAREST );
						}
						if(uniform.wrap == "clamp")
						{
							gl.texParameteri( tex.texture_type, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE );
							gl.texParameteri( tex.texture_type, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE );
						}
						texture_slot++;
					}
				}
				else
					uniforms[ varname ] = fx[j] !== undefined ? fx[j] : uniform.value;
			}
	}


	var shader = null;
	if(update_shader)
	{
		var functions_code = "";
		for(var i in included_functions)
		{
			var func = TextureFX.available_functions[ i ];
			if(!func)
			{
				console.error("TextureFX: Function not found: " + i);
				continue;
			}
			functions_code += func + "\n";
		}

		var fullcode = "\n\
			#extension GL_OES_standard_derivatives : enable\n\
			precision highp float;\n\
			#define color3 vec3\n\
			#define color4 vec4\n\
			uniform sampler2D u_texture;\n\
			uniform sampler2D u_texture_depth;\n\
			varying vec2 v_coord;\n\
			uniform vec2 u_viewport;\n\
			uniform vec2 u_iviewport;\n\
			uniform float u_aspect;\n\
			uniform vec2 u_random;\n\
			vec2 uv;\n\
			" + uniforms_code + "\n\
			" + functions_code + "\n\
			void main() {\n\
				uv = v_coord;\n\
				vec2 to_center = vec2(0.5) - uv;\n\
				float dist_to_center = length(to_center);\n\
				" + uv_code + "\n\
				vec4 color = texture2D(u_texture, uv);\n\
				float temp = 0.0;\n\
				" + color_code + "\n\
				gl_FragColor = color;\n\
			}\n\
			";

		this._last_shader = new GL.Shader( GL.Shader.SCREEN_VERTEX_SHADER, fullcode );
	}

	shader = this._last_shader;

	if(shader.hasUniform("u_texture_depth"))
		depth_texture.bind(1);

	color_texture.setParameter( gl.TEXTURE_MAG_FILTER, gl.LINEAR );
	color_texture.setParameter( gl.TEXTURE_MIN_FILTER, gl.LINEAR );

	if( this.apply_fxaa )
	{
		if(!this.temp_tex || this.temp_tex.width != gl.viewport_data[2] || this.temp_tex.height != gl.viewport_data[3])
			this.temp_tex = new GL.Texture(gl.viewport_data[2],gl.viewport_data[3]);
		this.temp_tex.drawTo(function(){
			color_texture.toViewport( shader, uniforms );
		});
		var fx_aa_shader = GL.Shader.getFXAAShader();
		fx_aa_shader.setup();

		if(!output_texture)
			this.temp_tex.toViewport( fx_aa_shader );
		else
			this.temp_tex.copyTo( output_texture, fx_aa_shader );
	}
	else
	{
		this.temp_tex = null;
		if(!output_texture)
			color_texture.toViewport( shader, uniforms );
		else
		{
			shader.uniforms( uniforms );
			this.temp_tex.copyTo( output_texture, shader );
		}
	}
}

TextureFX.prototype.getTexture = function( name )
{
	return LS.ResourcesManager.getTexture( name );
}

LS.TextureFX = TextureFX;
LS.Tween = {

	EASE_IN_QUAD: 1,
	EASE_OUT_QUAD: 2,
	EASE_IN_OUT_QUAD: 3,
	QUAD: 3,

	EASE_IN_CUBIC: 4,
	EASE_OUT_CUBIC: 5,
	EASE_IN_OUT_CUBIC: 6,
	CUBIC: 6,

	EASE_IN_QUART: 7,
	EASE_OUT_QUART: 8,
	EASE_IN_OUT_QUART: 9,
	QUART: 9,

	EASE_IN_SINE: 10,
	EASE_OUT_SINE: 11,
	EASE_IN_OUT_SINE: 12,
	SINE: 12,

	EASE_IN_EXPO: 13,
	EASE_OUT_EXPO: 14,
	EASE_IN_OUT_EXPO: 15,
	EXPO: 15,

	EASE_IN_BACK: 16,
	EASE_OUT_BACK: 17,
	EASE_IN_OUT_BACK: 18,
	BACK: 18,

	current_easings: [],
	_alife: [], //temporal array

	reset: function()
	{
		this.current_easings = [];
		this._alife = [];
	},

	easeProperty: function( object, property, target, time, easing_function, on_complete, on_progress )
	{
		if( !object )
			throw("ease object cannot be null");
		if( target === undefined )
			throw("target vaue must be defined");
		if(object[property] === undefined)
			throw("property not found in object, must be initialized to a value");

		easing_function = easing_function || this.EASE_IN_OUT_QUAD;

		//clone to avoid problems
		var origin = null;
		
		if(property)
			origin = LS.cloneObject( object[ property ] );
		else
			origin = LS.cloneObject( object );
		target = LS.cloneObject( target );

		//precompute target value size
		var size = 0;
		if(target.constructor === Number)
			size = -1;
		else if(target && target.length !== undefined)
			size = target.length;

		var data = { object: object, property: property, origin: origin, target: target, current: 0, time: time, easing: easing_function, on_complete: on_complete, on_progress: on_progress, size: size };

		for(var i = 0; i < this.current_easings.length; ++i)
		{
			if( this.current_easings[i].object == object && this.current_easings[i].property == property )
			{
				this.current_easings[i] = data; //replace old easing
				break;
			}
		}

		this.current_easings.push( data );
		return data;
	},

	easeObject: function( object, target, time, easing_function, on_complete, on_progress )
	{
		if( !object || !target )
			throw("ease object cannot be null");

		easing_function = easing_function || this.EASE_IN_OUT_QUAD;

		//clone to avoid problems
		var origin = LS.cloneObject( object );
		target = LS.cloneObject( target );

		//precompute size
		var size = 0;
		if(target.length !== undefined)
			size = target.length;

		var data = { object: object, origin: origin, target: target, current: 0, time: time, easing: easing_function, on_complete: on_complete, on_progress: on_progress, size: size };

		for(var i = 0; i < this.current_easings.length; ++i)
		{
			if( this.current_easings[i].object == object )
			{
				this.current_easings[i] = data; //replace old easing
				break;
			}
		}

		this.current_easings.push( data );
		return data;
	},

	update: function( dt )
	{
		if( !this.current_easings.length )
			return;

		var easings = this.current_easings;
		var alive = this._alife;
		alive.length = easings.length;
		var pos = 0;

		for(var i = 0, l = easings.length; i < l; ++i)
		{
			var item = easings[i];
			item.current += dt;
			var t = 1;
			if(item.current < item.time)
			{
				t = item.current / item.time;
				alive[ pos ] = item;
				pos += 1;
			}

			var f = this.getEaseFactor( t, item.easing );

			var result = null;

			if(item.size)
			{
				if(item.size == -1) //number
					item.object[ item.property ] = item.target * f + item.origin * ( 1.0 - f );
				else
				{
					var property = item.object[ item.property ];
					for(var j = 0; j < item.size; ++j)
						property[j] = item.target[j] * f + item.origin[j] * ( 1.0 - f );
				}
				if(item.object.mustUpdate !== undefined)
					item.object.mustUpdate = true;
			}

			if(item.on_progress)
				item.on_progress( item );

			if(t == 1 && item.on_complete)
				item.on_complete( item );
		}

		alive.length = pos; //trim

		this.current_easings = alive;
		this._alife = easings;
	},

	getEaseFactor: function(t,type)
	{
		if(t>1) 
			t = 1;
		else if(t < 0)
			t = 0;
		var s = 1.70158;
		type = type || this.QUAD;
		switch(type)
		{
			case this.EASE_IN_QUAD: return (t*t);
			case this.EASE_OUT_QUAD: return 1-(t*t);
			case this.EASE_IN_OUT_QUAD: { 
				t *= 2;
				if( t < 1 ) return 0.5 * t * t;
				t -= 1;
				return -0.5 * ((t)*(t-2) - 1);
			};

			case this.EASE_IN_CUBIC: return t*t*t;
			case this.EASE_OUT_CUBIC: {
				t -= 1;
				return t*t*t + 1;
			};
			case this.EASE_IN_OUT_CUBIC: {
				t *= 2;
				if( t < 1 )
					return 0.5 * t*t*t;
				t -= 2;
				return 0.5*(t*t*t + 2);
			};

			case this.EASE_IN_QUART: return t*t*t*t;
			case this.EASE_OUT_QUART: {
				t -= 1;
				return -(t*t*t*t - 1);
			}
			case this.EASE_IN_OUT_QUART: {
				t *= 2;
				if( t < 1 ) return 0.5*t*t*t*t;
				else {
					t -= 2;
					return -0.5 * (t*t*t*t - 2);
				}
			}

			case this.EASE_IN_SINE:	return 1-Math.cos( t * Math.PI / 2 );
			case this.EASE_OUT_SINE:	return Math.sin( t * Math.PI / 2 );
			case this.EASE_IN_OUT_SINE: return -0.5 * ( Math.cos( Math.PI * t ) - 1 );

			case this.EASE_IN_EXPO: return t == 0 ? 0 : Math.pow( 2, 10 * (t - 1) );
			case this.EASE_OUT_EXPO: return t == 1 ? 1 : 1 - Math.pow( 2, -10 * t );
			case this.EASE_IN_OUT_EXPO: {
				if( t == 0 ) return 0;
				if( t == 1 ) return 1;
				t *= 2;
				if( t < 1 ) return 0.5 * Math.pow( 2, 10 * (t - 1) );
				return 0.5 * ( -Math.pow( 2, -10 * (t - 1)) + 2);
			}

			case this.EASE_IN_BACK: return t * t * ((s+1)*t - s);
			case this.EASE_OUT_BACK: return (t*t*((s+1)*t + s) + 1);
			case this.EASE_IN_OUT_BACK: {
				t *= 2;
				if( t < 1 ) {
					s *= 1.525;
					return 0.5*(t*t*((s+1)*t - s));
				}
				else {
					t -= 2;
					s *= 1.525;
					return 0.5*(t*t*((s+1)*t+ s) + 2);
				}
			};
		}
		return t;
	}
};

/** RenderSettings contains how the scene should be renderer 
* There could be different renderSettings for different scene quality.
* @class RenderSettings
* @constructor
**/

function RenderSettings( o )
{
	this.renderer_name = null; //null means default

	//global render settings
	this.default_shadowmap_resolution = LS.Light.DEFAULT_SHADOWMAP_RESOLUTION; //let the system decide best shadowmap resolution according to quality settings
	this.ignore_viewports = false;	//render to full viewport, ignoring the viewport in the cameras
	this.ignore_clear = false;	//skip global clear, used in case you want to mix LiteScene with another renderer
	this.keep_viewport = false; //do not force a full canvas viewport at render start (use the current one in WebGL as the full)
	this.linear_pipeline = false; //tries to degamma all the albedo textures.

	this.shadows_enabled = true; //allow shadowmaps
	this.update_shadowmaps = true; //automatically update shadowmaps in every frame (enable if there are dynamic objects)
	this.update_all_shadowmaps = false; //update shadowmaps even if they are not visible

	this.force_wireframe = false; //render everything in wireframe
	this.lights_disabled = false; //flat lighting
	this.low_quality = false;	//try to use low quality shaders (where available)

	this.update_materials = true; //update info in materials in every frame
	this.render_all_cameras = true; //render secundary cameras too
	this.render_fx = true; //postprocessing fx
	this.render_gui = true; //render gui
	this.render_helpers = true; //render helpers (for the editor)

	this.sort_instances_by_distance = true; //sort render instances by distance 
	this.sort_instances_by_priority = true; //sort render instances by priority
	this.z_pass = false; //enable when the shaders are too complex (normalmaps, etc) to reduce work of the GPU (still some features missing)
	this.frustum_culling = true; //test bounding box by frustum to determine visibility
	this.depth_test = true;	//do depth test when rendering

	this.clipping_plane = null;

	//info
	this.in_player = true; //is in the player (not in the editor)

	//this should change one day...
	this.default_shader_id = "global";
	this.default_low_shader_id = "lowglobal";

	if(o)
		this.configure(o);
}

RenderSettings["@default_shadowmap_resolution"] = { widget: "combo", values: [0,256,512,1024,2048,4096] };

RenderSettings.prototype.serialize = function()
{
	return LS.cloneObject(this);
}

RenderSettings.prototype.configure = function(o)
{
	if(o)
		for(var i in o)
			this[i] = o[i];
}

RenderSettings.prototype.toJSON = RenderSettings.prototype.serialize;

LS.RenderSettings = RenderSettings;
/**
* RenderInstance contains info of one object to be rendered on the scene.
*
* @class RenderInstance
* @namespace LS
* @constructor
*/

//Flags to control rendering states
//0-7: render state flags
var RI_CULL_FACE =			1;		//for two sided
var RI_CW =					1 << 1; //reverse normals
var RI_DEPTH_TEST =			1 << 2; //use depth test
var RI_DEPTH_WRITE = 		1 << 3; //write in the depth buffer
var RI_ALPHA_TEST =			1 << 4; //do alpha test
var RI_BLEND = 				1 << 5; //use blend function

//8-16: rendering pipeline flags
var RI_CAST_SHADOWS = 		1 << 8;	//render in shadowmaps
var RI_RECEIVE_SHADOWS =	1 << 9;	//receive shadowmaps
var RI_IGNORE_LIGHTS = 		1 << 10;//render without taking into account light info
var RI_IGNORE_FRUSTUM = 	1 << 11;//render even when outside of frustum //CHANGE TO VALID_BOUNDINGBOX
//var RI_RENDER_2D = 			1 << 12;//render in screen space using the position projection (similar to billboard)
var RI_IGNORE_VIEWPROJECTION = 1 << 13; //do not multiply by viewprojection, use model as mvp
var RI_IGNORE_CLIPPING_PLANE = 1 << 14; //ignore the plane clipping (in reflections)

//16-24: instance properties
var RI_RAYCAST_ENABLED = 1 << 16; //if it could be raycasted
var RI_IGNORE_AUTOUPDATE = 1 << 17; //if it could update matrix from scene


//default flags for any instance
var RI_DEFAULT_FLAGS = RI_CULL_FACE | RI_DEPTH_TEST | RI_DEPTH_WRITE | RI_CAST_SHADOWS | RI_RECEIVE_SHADOWS;
//var RI_2D_FLAGS = RI_RENDER_2D | RI_CULL_FACE | RI_BLEND | RI_IGNORE_LIGHTS | RI_IGNORE_FRUSTUM;

function RenderInstance( node, component )
{
	this._key = ""; //not used yet
	this.uid = LS.generateUId("RINS"); //unique identifier for this RI
	this.layers = 3;

	//info about the mesh
	this.vertex_buffers = {};
	this.index_buffer = null;
	this.wireframe_index_buffer = null;
	this.range = new Int32Array([0,-1]); //start, offset
	this.primitive = gl.TRIANGLES;

	this.mesh = null; //shouldnt be used (buffers are added manually), but just in case
	this.collision_mesh = null; //in case of raycast

	//used in case the object has a secondary mesh
	this.lod_mesh = null;
	this.lod_vertex_buffers = {};
	this.lod_index_buffer = null;

	//where does it come from
	this.node = node;
	this.component = component;
	this.priority = 10; //instances are rendered from higher to lower priority

	//rendering flags
	this.flags = RI_DEFAULT_FLAGS;
	this.blend_func = LS.BlendFunctions["normal"]; //Blend.funcs["add"], ...

	//transformation
	this.matrix = mat4.create();
	this.normal_matrix = mat4.create();
	this.center = vec3.create();

	//for visibility computation
	this.oobb = BBox.create(); //object space bounding box
	this.aabb = BBox.create(); //axis aligned bounding box

	//info about the material
	this.material = null;
	//this.materials = null; //for multimaterial rendering, LONG FUTURE...

	//for extra data for the shader
	this.query = new LS.ShaderQuery();
	this.uniforms = {};
	this.samplers = {};

	this._camera_visibility = 0; //tells in which camera was visible this instance during the last rendering
	this._is_visible = false; //used during the rendering

	//for internal use
	this._dist = 0; //computed during rendering, tells the distance to the current camera
	this._final_query = new LS.ShaderQuery();
	this._final_uniforms = {};
	this._final_samplers = {};
}

/*
//not used
RenderInstance.prototype.generateKey = function(step, options)
{
	this._key = step + "|" + this.node.uid + "|" + this.material.uid + "|";
	return this._key;
}
*/

//set the material and apply material flags to render instance
RenderInstance.prototype.setMatrix = function(matrix, normal_matrix)
{
	this.matrix.set( matrix );

	if( normal_matrix )
		this.normal_matrix.set( normal_matrix )
	else
		this.computeNormalMatrix();
}

/**
* Updates the normal matrix using the matrix
*
* @method computeNormalMatrix
*/
RenderInstance.prototype.computeNormalMatrix = function()
{
	var m = mat4.invert(this.normal_matrix, this.matrix);
	if(m)
		mat4.transpose(this.normal_matrix, m);
}

//set the material and apply material flags to render instance
RenderInstance.prototype.setMaterial = function(material)
{
	this.material = material;
	if(material)
		material.applyToRenderInstance(this);
}

//sets the buffers to render, the primitive, and the bounding
RenderInstance.prototype.setMesh = function(mesh, primitive)
{
	if( primitive == -1 || primitive === undefined )
		primitive = gl.TRIANGLES;
	this.primitive = primitive;

	if(mesh != this.mesh)
	{
		this.mesh = mesh;
		this.vertex_buffers = {};
	}
	//this.vertex_buffers = mesh.vertexBuffers;
	for(var i in mesh.vertexBuffers)
		this.vertex_buffers[i] = mesh.vertexBuffers[i];

	switch(primitive)
	{
		case gl.TRIANGLES: 
			this.index_buffer = mesh.indexBuffers["triangles"]; //works for indexed and non-indexed
			break;
		case gl.LINES: 
			/*
			if(!mesh.indexBuffers["lines"])
				mesh.computeWireframe();
			*/
			this.index_buffer = mesh.indexBuffers["lines"];
			break;
		case 10:  //wireframe
			this.primitive = gl.LINES;
			if(!mesh.indexBuffers["wireframe"])
				mesh.computeWireframe();
			this.index_buffer = mesh.indexBuffers["wireframe"];
			break;

		case gl.POINTS: 
		default:
			this.index_buffer = null;
			break;
	}

	if(mesh.bounding)
	{
		this.oobb.set( mesh.bounding ); //copy
		this.flags &= ~RI_IGNORE_FRUSTUM; //test against frustum
	}
	else
		this.flags |= RI_IGNORE_FRUSTUM; //no frustum, no test
}

//assigns a secondary mesh in case the object is too small on the screen
RenderInstance.prototype.setLODMesh = function(lod_mesh)
{
	if(!lod_mesh)
	{
		this.lod_mesh = null;
		this.lod_vertex_buffers = null;
		this.lod_index_buffer = null;
		return;
	}

	if(lod_mesh != this.lod_mesh)
	{
		this.lod_mesh = lod_mesh;
		this.lod_vertex_buffers = {};
	}
	//this.vertex_buffers = mesh.vertexBuffers;
	for(var i in lod_mesh.vertexBuffers)
		this.lod_vertex_buffers[i] = lod_mesh.vertexBuffers[i];

	switch(this.primitive)
	{
		case gl.TRIANGLES: 
			this.lod_index_buffer = lod_mesh.indexBuffers["triangles"]; //works for indexed and non-indexed
			break;
		case gl.LINES: 
			/*
			if(!mesh.indexBuffers["lines"])
				mesh.computeWireframe();
			*/
			this.lod_index_buffer = lod_mesh.indexBuffers["lines"];
			break;
		case 10:  //wireframe
			if(!lod_mesh.indexBuffers["wireframe"])
				lod_mesh.computeWireframe();
			this.lod_index_buffer = lod_mesh.indexBuffers["wireframe"];
			break;
		case gl.POINTS: 
		default:
			this.lod_index_buffer = null;
			break;
	}
}

RenderInstance.prototype.setRange = function(start, offset)
{
	this.range[0] = start;
	this.range[1] = offset;
}

/**
* takes the flags on the node and update the render instance flags
*
* @method applyNodeFlags
*/
RenderInstance.prototype.applyNodeFlags = function()
{
	var node_flags = this.node.flags;
	this.layers = this.node.layers;

	if(node_flags.two_sided == true) this.flags &= ~RI_CULL_FACE;
	else this.flags |= RI_CULL_FACE;

	if(node_flags.flip_normals == true) this.flags |= RI_CW;
	else this.flags &= ~RI_CW;

	if(node_flags.depth_test == false) this.flags &= ~RI_DEPTH_TEST;
	else this.flags |= RI_DEPTH_TEST;

	if(node_flags.depth_write == false) this.flags &= ~RI_DEPTH_WRITE;
	else this.flags |= RI_DEPTH_WRITE;

	//if(node_flags.alpha_test == true) this.flags |= RI_ALPHA_TEST;
	//else this.flags &= ~RI_ALPHA_TEST;

	if(node_flags.cast_shadows == false) this.flags &= ~RI_CAST_SHADOWS;
	else this.flags |= RI_CAST_SHADOWS;

	if(node_flags.receive_shadows == false) this.flags &= ~RI_RECEIVE_SHADOWS;	
	else this.flags |= RI_RECEIVE_SHADOWS;	
}

/**
* Enable flag in the flag bit field
*
* @method enableFlag
* @param {number} flag id
*/
RenderInstance.prototype.enableFlag = function(flag)
{
	this.flags |= flag;
}

/**
* Disable flag in the flag bit field
*
* @method enableFlag
* @param {number} flag id
*/
RenderInstance.prototype.disableFlag = function(flag)
{
	this.flags &= ~flag;
}

/**
* Tells if a flag is enabled
*
* @method enableFlag
* @param {number} flag id
* @return {boolean} flag value
*/
RenderInstance.prototype.isFlag = function(flag)
{
	return (this.flags & flag);
}

/**
* Computes the instance bounding box in world space from the one in local space
*
* @method updateAABB
*/
RenderInstance.prototype.updateAABB = function()
{
	BBox.transformMat4(this.aabb, this.oobb, this.matrix );
}

/**
* Used to update the RI info without having to go through the collectData process, it is faster but some changes may take a while
*
* @method update
*/
RenderInstance.prototype.update = function()
{
	if(!this.node || !this.node.transform)
		return;
	this.setMatrix( this.node.transform._global_matrix );
}

/**
* Calls render taking into account primitive and range
*
* @method render
* @param {Shader} shader
*/
RenderInstance.prototype.render = function(shader)
{
	if(this.lod_mesh)
	{
		//very bad LOD function...
		var f = this.oobb[12] / Math.max(0.1, this._dist);
		if( f < 0.1 )
		{
			shader.drawBuffers( this.lod_vertex_buffers,
			  this.lod_index_buffer,
			  this.primitive);
			return;
		}
	}

	shader.drawBuffers( this.vertex_buffers,
	  this.index_buffer,
	  this.primitive, this.range[0], this.range[1] );
}

RenderInstance.prototype.overlapsSphere = function(center, radius)
{
	//we dont know if the bbox of the instance is valid
	if(this.flags & RI_IGNORE_FRUSTUM)
		return true;
	return geo.testSphereBBox( center, radius, this.aabb );
}

/**
* Checks if this object was visible by a camera during the last frame
*
* @method wasVisibleByCamera
* @param {LS.Camera} camera [optional] if a camera is supplied it checks if it was visible by that camera, otherwise tells you if it was visible by any camera
* @return {Boolean} true if it was visible by the camera (or any camera if no camera supplied), false otherwise
*/
RenderInstance.prototype.wasVisibleByCamera = function( camera )
{
	if(!camera)
		return this._camera_visibility != 0;
	return (this._camera_visibility | (1<<(camera._rendering_index))) ? true : false;
}


/* moved to PhysicsInstance
RenderInstance.prototype.setCollisionMesh = function(mesh)
{
	this.flags |= RI_USE_MESH_AS_COLLIDER;
	this.collision_mesh = mesh;
}
*/

LS.RenderInstance = RenderInstance;
/*	
	RenderFrameContainer
	This class is used when you want to render the scene not to the screen but to some texture for postprocessing
	Check the CameraFX components to see it in action.
*/

function RenderFrameContainer()
{
	this.width = RenderFrameContainer.default_width;
	this.height = RenderFrameContainer.default_height;

	this.use_high_precision = false;
	this.use_depth_texture = true;
	this.use_extra_texture = false;

	this.camera = null;
}

RenderFrameContainer.default_width = 1024;
RenderFrameContainer.default_height = 512;

RenderFrameContainer.prototype.useDefaultSize = function()
{
	this.width = LS.RenderFrameContainer.default_width;
	this.height = LS.RenderFrameContainer.default_height;
}

RenderFrameContainer.prototype.useCanvasSize = function()
{
	this.width = gl.canvas.width;
	this.height = gl.canvas.height;
}

RenderFrameContainer.prototype.setSize = function( width, height )
{
	if(width < 1)
		width = 1;
	if(height < 1)
		height = 1;

	this.width = width;
	this.height = height;
}


RenderFrameContainer.prototype.preRender = function( render_settings )
{
	var camera = LS.Renderer._current_camera;

	this.startFBO();
	//overwrite to create some buffers here attached to the current FBO

	//set depth info inside the texture
	if(this.depth_texture && camera)
	{
		if(!this.depth_texture.near_far_planes)
			this.depth_texture.near_far_planes = vec2.create();
		this.depth_texture.near_far_planes[0] = camera.near;
		this.depth_texture.near_far_planes[1] = camera.far;
	}

}

RenderFrameContainer.prototype.postRender = function( render_settings )
{
	this.endFBO();
	//detach FBO and render to viewport
	//render to screen
	//this.renderToViewport( this.textures["color"], true );
}

//helper in case you want have a Color and Depth texture
RenderFrameContainer.prototype.startFBO = function()
{
	//Create textures
	var format = gl.RGBA;
	var type = this.use_high_precision ? gl.HIGH_PRECISION_FORMAT : gl.UNSIGNED_BYTE;
	var width = this.width;
	var height = this.height;

	//for the color
	if(!this.color_texture || this.color_texture.width != width || this.color_texture.height != height || this.color_texture.type != type)
		this.color_texture = new GL.Texture( width, height, { filter: gl.LINEAR, format: format, type: type });

	//extra color texture (multibuffer rendering)
	if( this.use_extra_texture && (!this.extra_texture || this.extra_texture.width != width || this.extra_texture.height != height || this.extra_texture.type != type) )
		this.extra_texture = new GL.Texture( width, height, { filter: gl.LINEAR, format: format, type: type });
	else if( !this.use_extra_texture )
		this.extra_texture = null;

	//for the depth
	if( this.use_depth_texture && (!this.depth_texture || this.depth_texture.width != width || this.depth_texture.height != height) && gl.extensions["WEBGL_depth_texture"] )
		this.depth_texture = new GL.Texture( width, height, { filter: gl.NEAREST, format: gl.DEPTH_COMPONENT, type: gl.UNSIGNED_INT });
	else if( !this.use_depth_texture )
		this.depth_texture = null;

	if( !this._fbo )
		this._fbo = new GL.FBO();
	this._fbo.setTextures( [this.color_texture], this.depth_texture, true );

	this._fbo.bind(); //changes viewport to full FBO size (saves old)

	LS.Renderer._full_viewport.set( gl.viewport_data );
	this._old_aspect = LS.Renderer.global_aspect;
	//LS.Renderer.global_aspect = (gl.canvas.width / gl.canvas.height) / (width / height);

	/*
	//Setup FBO
	this._fbo = this._fbo || gl.createFramebuffer();
	gl.bindFramebuffer( gl.FRAMEBUFFER, this._fbo );

	//Adjust viewport and aspect
	gl.viewport(0, 0, color_texture.width, color_texture.height );
	LS.Renderer._full_viewport.set( gl.viewport_data );
	LS.Renderer.global_aspect = (gl.canvas.width / gl.canvas.height) / (color_texture.width / color_texture.height);

	var ext = gl.extensions["WEBGL_draw_buffers"];

	//bind COLOR BUFFER
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, color_texture.handler, 0);

	//bind EXTRA COLOR TEXTURE?
	if(ext && extra_texture)
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + 1, gl.TEXTURE_2D, extra_texture.handler, 0);

	//bind DEPTH texture or depth renderbuffer
	if(depth_texture)
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT,  gl.TEXTURE_2D, depth_texture.handler, 0);
	else
	{
		gl.renderbufferStorage( gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height );
		gl.framebufferRenderbuffer( gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, renderbuffer );
	}

	//Check completeness
	var complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
	if(complete !== gl.FRAMEBUFFER_COMPLETE)
		throw("FBO not complete: " + complete);

	if(ext && extra_texture)
		ext.drawBuffersWEBGL( [ gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT0 + 1] );
	*/
}

RenderFrameContainer.prototype.endFBO = function()
{
	this._fbo.unbind(); //restores viewport to old saved one
	LS.Renderer._full_viewport.set( this._fbo._old_viewport );
	LS.Renderer.global_aspect = this._old_aspect;

	/*
	//disable FBO
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	LS.Renderer.global_aspect = 1.0;

	gl.viewport( 0, 0, gl.canvas.width, gl.canvas.height );
	LS.Renderer._full_viewport.set( gl.viewport_data );
	*/
}

//Render this texture to viewport (allows to apply FXAA)
RenderFrameContainer.prototype.renderToViewport = function( texture, use_antialiasing )
{
	if(!use_antialiasing)
	{
		texture.toViewport();
		return;
	}

	var shader = GL.Shader.getFXAAShader();
	var viewport = gl.getViewport();
	var mesh = Mesh.getScreenQuad();
	texture.bind(0);
	shader.uniforms( {u_texture:0, uViewportSize: viewport.subarray(2,4), inverseVP: [1 / tex.width, 1 / tex.height]} ).draw(mesh);
}


LS.RenderFrameContainer = RenderFrameContainer;


//************************************
/**
* The Renderer is in charge of generating one frame of the scene. Contains all the passes and intermediate functions to create the frame.
*
* @class Renderer
* @namespace LS
* @constructor
*/

//passes
var COLOR_PASS = 1;
var SHADOW_PASS = 2;
var PICKING_PASS = 3;

var Renderer = {

	default_render_settings: new LS.RenderSettings(), //overwritten by the global info or the editor one
	default_material: new StandardMaterial(), //used for objects without material

	render_passes: {}, //used to specify the render function for every kind of render pass (color, shadow, picking, etc)
	renderPassFunction: null, //function to call when rendering instances

	global_aspect: 1, //used when rendering to a texture that doesnt have the same aspect as the screen

	default_point_size: 1, //point size in pixels (could be overwritte by render instances)

	_global_viewport: vec4.create(), //the viewport we have available to render the full frame (including subviewports), usually is the 0,0,gl.canvas.width,gl.canvas.height
	_full_viewport: vec4.create(), //contains info about the full viewport available to render (current texture size or canvas size)

	//temporal info
	_current_scene: null,
	_current_render_settings: null,
	_current_camera: null,
	_current_target: null, //texture where the image is being rendered
	_current_pass: null,

	_main_camera: null,

	_visible_cameras: null,
	_visible_lights: null,
	_visible_instances: null,

	//stats
	_rendercalls: 0, //calls to instance.render
	_rendered_instances: 0, //instances processed
	_frame: 0,

	//settings
	_collect_frequency: 1, //used to reuse info (WIP)

	//reusable locals
	_view_matrix: mat4.create(),
	_projection_matrix: mat4.create(),
	_viewprojection_matrix: mat4.create(),
	_2Dviewprojection_matrix: mat4.create(),
	_mvp_matrix: mat4.create(),
	_temp_matrix: mat4.create(),
	_identity_matrix: mat4.create(),

	_close_lights: [],

	//called from...
	init: function()
	{
		this._missing_texture = new GL.Texture(1,1, { pixel_data: [128,128,128,255] });
		LS.Draw.init();
		LS.Draw.onRequestFrame = function() { LS.GlobalScene.refresh(); }

		this.registerRenderPass( "color", { id: COLOR_PASS, render_instance: this.renderColorPassInstance } );
		this.registerRenderPass( "shadow", { id: SHADOW_PASS, render_instance: this.renderShadowPassInstance } );
		this.registerRenderPass( "picking", { id: PICKING_PASS, render_instance: this.renderPickingPassInstance } );
	},

	reset: function()
	{
	},

	//used to store which is the current full viewport available (could be different from the canvas in case is a FBO or the camera has a partial viewport)
	setFullViewport: function(x,y,w,h)
	{
		if(x.constructor === Number)
		{
			this._full_viewport[0] = x; this._full_viewport[1] = y; this._full_viewport[2] = w; this._full_viewport[3] = h;
		}
		else if(x.length)
			this._full_viewport.set(x);
	},

	/**
	* Renders the current scene to the screen
	* Many steps are involved, from gathering info from the scene tree, generating shadowmaps, setup FBOs, render every camera
	*
	* @method render
	* @param {SceneTree} scene
	* @param {RenderSettings} render_settings
	* @param {Array} [cameras=null] if no cameras are specified the cameras are taken from the scene
	*/
	render: function( scene, render_settings, cameras )
	{
		if(!LS.ShadersManager.ready)
			return; //not ready

		render_settings = render_settings || this.default_render_settings;
		this._current_render_settings = render_settings;
		this._current_scene = scene;
		this._main_camera = cameras ? cameras[0] : null;

		//done at the beginning just in case it crashes
		scene._frame += 1;
		this._frame += 1;
		scene._must_redraw = false;

		this._rendercalls = 0;
		this._rendered_instances = 0;

		if( !render_settings.keep_viewport )
		{
			gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
			this.setFullViewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
		}
		else
			this.setFullViewport( gl.viewport_data );
		this._global_viewport.set( gl.viewport_data );

		//Event: beforeRender used in actions that could affect which info is collected for the rendering
		LEvent.trigger(scene, "beforeRender", render_settings );
		scene.triggerInNodes("beforeRender", render_settings );

		//get render instances, cameras, lights, materials and all rendering info ready: computeVisibility
		this.processVisibleData( scene, render_settings, cameras );

		//Define the main camera, the camera that should be the most important (used for LOD info, or shadowmaps)
		cameras = cameras || this._visible_cameras;
		this._visible_cameras = cameras; //the cameras being rendered
		this._main_camera = cameras[0];

		//remove the lights that do not lay in front of any camera (this way we avoid creating shadowmaps)
		//TODO

		//Event: renderShadowmaps helps to generate shadowMaps that need some camera info (which could be not accessible during processVisibleData)
		LEvent.trigger(scene, "renderShadows", render_settings );
		scene.triggerInNodes("renderShadows", render_settings ); //TODO: remove

		//Event: afterVisibility allows to cull objects according to the main camera
		scene.triggerInNodes("afterVisibility", render_settings ); //TODO: remove	

		//Event: renderReflections in case some realtime reflections are needed, this is the moment to render them inside textures
		LEvent.trigger(scene, "renderReflections", render_settings );
		scene.triggerInNodes("renderReflections", render_settings ); //TODO: remove

		//Event: beforeRenderMainPass in case a last step is missing
		LEvent.trigger(scene, "beforeRenderMainPass", render_settings );
		scene.triggerInNodes("beforeRenderMainPass", render_settings ); //TODO: remove

		//enable FX
		if(render_settings.render_fx)
			LEvent.trigger( scene, "enableFrameBuffer", render_settings );

		//render
		this.renderFrameCameras( cameras, render_settings );

		if( render_settings.keep_viewport )
			gl.setViewport( this._global_viewport );


		//disable and show FX
		if(render_settings.render_fx)
			LEvent.trigger( scene, "showFrameBuffer", render_settings );

		if(render_settings.render_gui)
			LEvent.trigger( scene, "renderGUI", render_settings );

		//Event: afterRender to give closure to some actions
		LEvent.trigger(scene, "afterRender", render_settings );
		scene.triggerInNodes("afterRender", render_settings ); //TODO: remove
	},

	/**
	* Calls renderFrame of every camera in the cameras list (triggering the appropiate events)
	*
	* @method renderFrameCameras
	* @param {Array} cameras
	* @param {RenderSettings} render_settings
	*/
	renderFrameCameras: function( cameras, render_settings, global_render_frame )
	{
		var scene = this._current_scene;

		//for each camera
		for(var i = 0; i < cameras.length; ++i)
		{
			var current_camera = cameras[i];

			LEvent.trigger(scene, "beforeRenderFrame", render_settings );
			LEvent.trigger(current_camera, "beforeRenderFrame", render_settings );
			LEvent.trigger(current_camera, "enableFrameBuffer", render_settings );

			//main render
			this.renderFrame( current_camera, render_settings ); 

			LEvent.trigger(current_camera, "showFrameBuffer", render_settings );
			LEvent.trigger(current_camera, "afterRenderFrame", render_settings );
			LEvent.trigger(scene, "afterRenderFrame", render_settings );
		}
	},

	/**
	* renders the view from one camera to the current viewport (could be a texture)
	*
	* @method renderFrame
	* @param {Camera} camera 
	* @param {Object} render_settings
	*/
	renderFrame: function ( camera, render_settings, scene )
	{
		if(scene) //in case we use another scene
			this.processVisibleData(scene, render_settings);

		scene = scene || this._current_scene;

		this.enableCamera( camera, render_settings, render_settings.skip_viewport ); //set as active camera and set viewport

		//scissors test for the gl.clear, otherwise the clear affects the full viewport
		gl.scissor( gl.viewport_data[0], gl.viewport_data[1], gl.viewport_data[2], gl.viewport_data[3] );
		gl.enable(gl.SCISSOR_TEST);

		//clear buffer
		var info = scene.info;
		if(info)
		{
			gl.clearColor( info.background_color[0],info.background_color[1],info.background_color[2], info.background_color[3] );
		}
		else
			gl.clearColor(0,0,0,0);

		if(render_settings.ignore_clear != true && (camera.clear_color || camera.clear_depth) )
			gl.clear( ( camera.clear_color ? gl.COLOR_BUFFER_BIT : 0) | (camera.clear_depth ? gl.DEPTH_BUFFER_BIT : 0) );

		gl.disable(gl.SCISSOR_TEST);

		//render scene

		LEvent.trigger(scene, "beforeRenderScene", camera );
		scene.triggerInNodes("beforeRenderScene", camera ); //TODO remove
		LEvent.trigger(this, "beforeRenderScene", camera );

		//here we render all the instances
		this.renderInstances(render_settings);

		LEvent.trigger(scene, "afterRenderScene", camera );
		scene.triggerInNodes("afterRenderScene", camera ); //TODO remove
		LEvent.trigger(this, "afterRenderScene", camera );

		if(render_settings.render_helpers)
			LEvent.trigger(this, "renderHelpers", camera );
	},

	/**
	* Set camera as the current camera, sets the viewport according to camera info, updates matrices, and prepares LS.Draw
	*
	* @method enableCamera
	* @param {Camera} camera
	* @param {RenderSettings} render_settings
	*/
	enableCamera: function(camera, render_settings, skip_viewport)
	{
		var scene = this._current_scene;

		LEvent.trigger( camera, "beforeEnabled", render_settings );
		LEvent.trigger( scene, "beforeCameraEnabled", camera );

		//assign viewport manually (shouldnt use camera.getLocalViewport to unify?)
		var startx = this._full_viewport[0];
		var starty = this._full_viewport[1];
		var width = this._full_viewport[2];
		var height = this._full_viewport[3];

		var final_x = Math.floor(width * camera._viewport[0] + startx);
		var final_y = Math.floor(height * camera._viewport[1] + starty);
		var final_width = Math.ceil(width * camera._viewport[2]);
		var final_height = Math.ceil(height * camera._viewport[3]);

		if(!skip_viewport)
		{
			//force fullscreen viewport?
			if(render_settings && render_settings.ignore_viewports )
			{
				camera._final_aspect = this.global_aspect * camera._aspect * (width / height);
				gl.viewport( this._full_viewport[0], this._full_viewport[1], this._full_viewport[2], this._full_viewport[3] );
			}
			else
			{
				camera._final_aspect = this.global_aspect * camera._aspect * (final_width / final_height); //what if we want to change the aspect?
				gl.viewport( final_x, final_y, final_width, final_height );
			}
		}

		//compute matrices
		camera.updateMatrices();

		//store matrices locally
		mat4.copy( this._view_matrix, camera._view_matrix );
		mat4.copy( this._projection_matrix, camera._projection_matrix );
		mat4.copy( this._viewprojection_matrix, camera._viewprojection_matrix );

		//2D Camera: TODO: MOVE THIS SOMEWHERE ELSE
		mat4.ortho( this._2Dviewprojection_matrix, -1, 1, -1, 1, 1, -1 );

		//set as the current camera
		this._current_camera = camera;

		//prepare camera
		camera.fillCameraShaderUniforms( scene );

		//Draw allows to render debug info easily
		Draw.reset(); //clear 
		Draw.setCameraPosition( camera.getEye() );
		Draw.setViewProjectionMatrix( this._view_matrix, this._projection_matrix, this._viewprojection_matrix );

		LEvent.trigger( camera, "afterEnabled", render_settings );
		LEvent.trigger( scene, "afterCameraEnabled", camera ); //used to change stuff according to the current camera (reflection textures)
	},
	
	/**
	* To set gl state to a known and constant state in every render pass
	*
	* @method resetGLState
	* @param {RenderSettings} render_settings
	*/
	resetGLState: function( render_settings )
	{
		render_settings = render_settings || this._current_render_settings;

		gl.enable( gl.CULL_FACE );
		if(render_settings.depth_test)
			gl.enable( gl.DEPTH_TEST );
		else
			gl.disable( gl.DEPTH_TEST );
		gl.disable( gl.BLEND );
		gl.depthFunc( gl.LESS );
		gl.depthMask(true);
		gl.frontFace(gl.CCW);
		gl.blendFunc( gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA );
		//gl.lineWidth(1);
	},

	/**
	* Calls the render method for every instance (it also takes into account events and frustrum culling)
	*
	* @method renderInstances
	* @param {RenderSettings} render_settings
	* @param {Array} instances array of RIs, if not specified the last visible_instances are rendered
	*/
	renderInstances: function( render_settings, instances )
	{
		var scene = this._current_scene;
		if(!scene)
			return console.warn("LS.Renderer.renderInstances: no scene found");

		var pass = this._current_pass;
		var camera = this._current_camera;
		var camera_index_flag = camera._rendering_index != -1 ? (1<<(camera._rendering_index)) : 0;
		var apply_frustum_culling = render_settings.frustum_culling;
		var frustum_planes = camera.updateFrustumPlanes();
		var layers_filter = camera.layers;
		if( render_settings.layers !== undefined )
			layers_filter = render_settings.layers;

		LEvent.trigger( scene, "beforeRenderInstances", render_settings );
		scene.triggerInNodes( "beforeRenderInstances", render_settings );

		//compute global scene info
		this.fillSceneShaderQuery( scene, render_settings );
		this.fillSceneShaderUniforms( scene, render_settings );

		//reset state of everything!
		this.resetGLState( render_settings );

		//this.updateVisibleInstances(scene,options);
		var render_instances = instances || this._visible_instances;

		LEvent.trigger( scene, "renderInstances", render_settings );
		LEvent.trigger( this, "renderInstances", render_settings );

		//reset again!
		this.resetGLState( render_settings );

		var render_instance_func = pass.render_instance;
		if(!render_instance_func)
			return;

		//compute visibility pass
		for(var i = 0, l = render_instances.length; i < l; ++i)
		{
			//render instance
			var instance = render_instances[i];
			var node_flags = instance.node.flags;
			instance._is_visible = false;

			//hidden nodes
			if( pass.id == SHADOW_PASS && !(instance.flags & RI_CAST_SHADOWS) )
				continue;
			if( pass.id == PICKING_PASS && node_flags.selectable === false )
				continue;
			if( (layers_filter & instance.layers) === 0 )
				continue;

			//done here because sometimes some nodes are moved in this action
			if(instance.onPreRender)
				if( instance.onPreRender( render_settings ) === false)
					continue;

			if(instance.material.opacity <= 0) //TODO: remove this, do it somewhere else
				continue;

			//test visibility against camera frustum
			if(apply_frustum_culling && !(instance.flags & RI_IGNORE_FRUSTUM))
			{
				if(geo.frustumTestBox( frustum_planes, instance.aabb ) == CLIP_OUTSIDE )
					continue;
			}

			//save visibility info
			instance._is_visible = true;
			if(camera_index_flag) //shadowmap cameras dont have an index
				instance._camera_visibility |= camera_index_flag;
		}

		//for each render instance
		for(var i = 0, l = render_instances.length; i < l; ++i)
		{
			//render instance
			var instance = render_instances[i];

			if(!instance._is_visible || !instance.mesh)
				continue;

			this._rendered_instances += 1;

			//choose the appropiate render pass
			render_instance_func.call( this, instance, render_settings ); //by default calls renderColorInstance but it could call renderShadowPassInstance

			//some instances do a post render action
			if(instance.onPostRender)
				instance.onPostRender( render_settings );
		}

		LEvent.trigger( scene, "renderScreenSpace", render_settings);

		//restore state
		this.resetGLState( render_settings );

		LEvent.trigger( scene, "afterRenderInstances", render_settings);
		scene.triggerInNodes("afterRenderInstances", render_settings);

		//and finally again
		this.resetGLState( render_settings );
	},

	//this function is in charge of rendering the regular color pass (used also for reflections)
	renderColorPassInstance: function( instance, render_settings )
	{
		var lights = this._visible_lights;
		var numLights = lights.length;
		var close_lights = this._close_lights;

		//Compute lights affecting this RI (by proximity, only takes into account spherical bounding)
		close_lights.length = 0;
		for(var j = 0; j < numLights; j++)
		{
			var light = lights[j];
			if( (light._root.layers & instance.layers) == 0 || (light._root.layers & this._current_camera.layers) == 0)
				continue;
			var light_intensity = light.computeLightIntensity();
			if(light_intensity < 0.0001)
				continue;
			var light_radius = light.computeLightRadius();
			var light_pos = light.position;
			if( light_radius == -1 || instance.overlapsSphere( light_pos, light_radius ) )
				close_lights.push( light );
		}

		//render multipass
		this.renderColorMultiPassLightingInstance( instance, close_lights, this._current_scene, render_settings );
	},

	/**
	* Renders this render instance taking into account all the lights that affect it and doing a render for every light
	*
	* @method renderColorMultiPassLightingInstance
	* @param {RenderInstance} instance
	* @param {Array} lights array containing al the lights affecting this RI
	* @param {SceneTree} scene
	* @param {RenderSettings} render_settings
	*/
	renderColorMultiPassLightingInstance: function( instance, lights, scene, render_settings )
	{
		var camera = this._current_camera;
		var node = instance.node;
		var material = instance.material;

		//compute matrices
		var model = instance.matrix;
		if(instance.flags & RI_IGNORE_VIEWPROJECTION)
			this._mvp_matrix.set( model );
		else
			mat4.multiply(this._mvp_matrix, this._viewprojection_matrix, model );

		//node matrix info
		var instance_final_query = instance._final_query;
		var instance_final_uniforms = instance._final_uniforms;
		var instance_final_samplers = instance._final_samplers;

		//maybe this two should be somewhere else
		instance_final_uniforms.u_model = model; 
		instance_final_uniforms.u_normal_model = instance.normal_matrix; 

		//update matrices (because they depend on the camera) 
		instance_final_uniforms.u_mvp = this._mvp_matrix;


		//FLAGS: enable GL flags like cull_face, CCW, etc
		this.enableInstanceFlags(instance, render_settings);

		//set blend flags
		if(material.blend_mode !== Blend.NORMAL)
		{
			gl.enable( gl.BLEND );
			if(instance.blend_func)
				gl.blendFunc( instance.blend_func[0], instance.blend_func[1] );
		}
		else
			gl.disable( gl.BLEND );

		//pack material samplers 
		var samplers = {};
		samplers.merge( scene._samplers );
		samplers.merge( instance_final_samplers );

		//enable samplers and store where [TODO: maybe they are not used..., improve here]
		var sampler_uniforms = this.bindSamplers( samplers );

		//find shader name
		var shader_name = render_settings.default_shader_id;
		if(render_settings.low_quality)
			shader_name = render_settings.default_low_shader_id;
		if( material.shader_name )
			shader_name = material.shader_name;

		//multi pass instance rendering
		var num_lights = lights.length;

		//no lights rendering (flat light)
		var ignore_lights = node.flags.ignore_lights || (instance.flags & RI_IGNORE_LIGHTS) || render_settings.lights_disabled;
		if(!num_lights || ignore_lights)
		{
			var query = new LS.ShaderQuery( shader_name, { FIRST_PASS:"", LAST_PASS:"", USE_AMBIENT_ONLY:"" });
			query.add( scene._query );
			query.add( instance_final_query ); //contains node, material and instance macros

			if( ignore_lights )
				query.setMacro( "USE_IGNORE_LIGHTS" );
			if(render_settings.clipping_plane && !(instance.flags & RI_IGNORE_CLIPPING_PLANE) )
				query.setMacro( "USE_CLIPPING_PLANE" );

			if( material.onModifyQuery )
				material.onModifyQuery( query );

			//resolve the shader
			var shader = ShadersManager.resolve( query );

			//assign uniforms
			shader.uniformsArray( [ sampler_uniforms, scene._uniforms, camera._uniforms, instance_final_uniforms ] );

			if(instance.flags & RI_IGNORE_VIEWPROJECTION)
				shader.setUniform("u_viewprojection", mat4.IDENTITY );

			//render
			instance.render( shader );
			this._rendercalls += 1;
			return;
		}

		//Regular rendering (multipass)
		for(var iLight = 0; iLight < num_lights; iLight++)
		{
			var light = lights[iLight];

			var query = new LS.ShaderQuery( shader_name );

			var light_query = light.getQuery( instance, render_settings );

			if(iLight === 0)
				query.setMacro("FIRST_PASS");
			if(iLight === (num_lights-1))
				query.setMacro("LAST_PASS");

			query.add( scene._query );
			query.add( instance_final_query ); //contains node, material and instance macros
			query.add( light_query );

			if(render_settings.clipping_plane && !(instance.flags & RI_IGNORE_CLIPPING_PLANE) )
				query.setMacro("USE_CLIPPING_PLANE");

			if( material.onModifyQuery )
				material.onModifyQuery( query );

			var shader = LS.ShadersManager.resolve( query );

			//fill shader data
			var light_uniforms = light.getUniforms( instance, render_settings );

			//secondary pass flags to make it additive
			if(iLight > 0)
			{
				gl.enable(gl.BLEND);
				gl.blendFunc(gl.SRC_ALPHA,gl.ONE);
				if(render_settings.depth_test)
				{
					gl.depthFunc( gl.LEQUAL );
					//gl.depthMask(true);
					if( node.flags.depth_test )
						gl.enable( gl.DEPTH_TEST );
					else
						gl.disable( gl.DEPTH_TEST );
				}
			}
			//set depth func
			if(material.depth_func)
				gl.depthFunc( gl[material.depth_func] );

			//assign uniforms
			shader.uniformsArray( [sampler_uniforms, scene._uniforms, camera._uniforms, instance_final_uniforms, light_uniforms] );

			//render the instance
			instance.render( shader );
			this._rendercalls += 1;

			//avoid multipass in simple shaders
			if(shader.global && !shader.global.multipass)
				break; 
		}
	},

	/**
	* Renders this RenderInstance into the shadowmap
	*
	* @method renderShadowPassInstance
	* @param {RenderInstance} instance
	* @param {RenderSettings} render_settings
	*/
	renderShadowPassInstance: function(instance, render_settings)
	{
		var scene = this._current_scene;
		var camera = this._current_camera;
		var node = instance.node;
		var material = instance.material;

		//compute matrices
		var model = instance.matrix;
		mat4.multiply(this._mvp_matrix, this._viewprojection_matrix, model );

		//node matrix info
		var instance_final_query = instance._final_query;
		var instance_final_uniforms = instance._final_uniforms;
		var instance_final_samplers = instance._final_samplers;

		//maybe this two should be somewhere else
		instance_final_uniforms.u_model = model; 
		instance_final_uniforms.u_normal_model = instance.normal_matrix; 

		//update matrices (because they depend on the camera) 
		instance_final_uniforms.u_mvp = this._mvp_matrix;

		//FLAGS
		this.enableInstanceFlags( instance, render_settings );

		var query = new ShaderQuery("depth");
		query.add( scene._query );
		query.add( instance_final_query );

		//if(this._current_target && this._current_target.texture_type === gl.TEXTURE_CUBE_MAP)
		//	query.setMacro("USE_LINEAR_SHADOWMAP");

		//not fully supported yet
		if(material.alpha_test_shadows == true )
		{
			query.setMacro("USE_ALPHA_TEST","0.5");
			var color = material.getTexture("color");
			if(color)
			{
				var color_uvs = material.textures["color_uvs"] || Material.DEFAULT_UVS["color"] || "0";
				query.setMacro("USE_COLOR_TEXTURE","uvs_" + color_uvs);
				color.bind(0);
			}

			var opacity = material.getTexture("opacity");
			if(opacity)	{
				var opacity_uvs = material.textures["opacity_uvs"] || Material.DEFAULT_UVS["opacity"] || "0";
				query.setMacro("USE_OPACITY_TEXTURE","uvs_" + opacity_uvs);
				opacity.bind(1);
			}
			//shader.uniforms({ texture: 0, opacity_texture: 1 });
		}

		var shader = ShadersManager.resolve( query );

		var samplers = {};
		samplers.merge( scene._samplers );
		samplers.merge( instance_final_samplers );
		var sampler_uniforms = this.bindSamplers( samplers, shader );
		/*
		var slot = 1;
		for(var i in samplers)
			if(shader.samplers[i]) //only enable a texture if the shader uses it
				sampler_uniforms[ i ] = samplers[i].bind( slot++ );
		*/

		shader.uniformsArray([ sampler_uniforms, scene._uniforms, camera._uniforms, instance._final_uniforms ]);

		instance.render(shader);
		this._rendercalls += 1;
	},

	/**
	* Render instance into the picking buffer
	*
	* @method renderPickingInstance
	* @param {RenderInstance} instance
	* @param {RenderSettings} render_settings
	*/
	renderPickingPassInstance: function( instance, render_settings )
	{
		var scene = this._current_scene;
		var camera = this._current_camera;
		var node = instance.node;
		var model = instance.matrix;
		mat4.multiply(this._mvp_matrix, this._viewprojection_matrix, model );
		var pick_color = LS.Picking.getNextPickingColor( node );
		/*
		this._picking_next_color_id += 10;
		var pick_color = new Uint32Array(1); //store four bytes number
		pick_color[0] = this._picking_next_color_id; //with the picking color for this object
		var byte_pick_color = new Uint8Array( pick_color.buffer ); //read is as bytes
		//byte_pick_color[3] = 255; //Set the alpha to 1
		this._picking_nodes[this._picking_next_color_id] = node;
		*/

		var query = new LS.ShaderQuery("flat");
		query.add( scene._query );
		query.add( instance._final_query );

		var shader = ShadersManager.resolve( query );
		shader.uniforms(scene._uniforms);
		shader.uniforms(camera._uniforms);
		shader.uniforms(instance.uniforms);
		shader.uniforms({u_model: model, u_mvp: this._mvp_matrix, u_material_color: pick_color });

		instance.render(shader);
	},

	bindSamplers: function(samplers, shader)
	{
		var sampler_uniforms = {};
		var slot = 0;
		for(var i in samplers)
		{
			var sampler = samplers[i];
			if(!sampler) //weird case
			{
				throw("Samplers should always be valid values"); //assert
			}

			//if(shader && !shader[i]) continue; ¿?

			//REFACTOR THIS
			var tex = null;
			if(sampler.constructor === String || sampler.constructor === Texture) //old way
			{
				tex = sampler;
				sampler = null;
			}
			else if(sampler.texture)
				tex = sampler.texture;
			else
				continue;

			if(tex.constructor === String)
				tex = LS.ResourcesManager.textures[ tex ];
			if(!tex)
			{
				tex = this._missing_texture;
				//continue;
			}

			//bind
			sampler_uniforms[ i ] = tex.bind( slot++ );

			//texture properties
			if(sampler)
			{
				if(sampler.minFilter)
					gl.texParameteri(tex.texture_type, gl.TEXTURE_MIN_FILTER, sampler.minFilter);
				if(sampler.magFilter)
					gl.texParameteri(tex.texture_type, gl.TEXTURE_MAG_FILTER, sampler.magFilter);
				if(sampler.wrap)
				{
					gl.texParameteri(tex.texture_type, gl.TEXTURE_WRAP_S, sampler.wrap);
					gl.texParameteri(tex.texture_type, gl.TEXTURE_WRAP_T, sampler.wrap);
				}
			}
		}

		return sampler_uniforms;
	},

	/**
	* Update the scene shader query according to the render pass
	* Do not reuse the query, they change between rendering passes (shadows, reflections, etc)
	*
	* @method fillSceneShaderQuery
	* @param {SceneTree} scene
	* @param {RenderSettings} render_settings
	*/
	fillSceneShaderQuery: function( scene, render_settings )
	{
		var query = new ShaderQuery();

		if( this._current_camera.type == Camera.ORTHOGRAPHIC )
			query.setMacro("USE_ORTHOGRAPHIC_CAMERA");

		//camera info
		if( this._current_pass.id == COLOR_PASS )
		{
			if(render_settings.linear_pipeline)
				query.setMacro("USE_LINEAR_PIPELINE");

			if(render_settings.brightness_factor && render_settings.brightness_factor != 1)
				query.setMacro("USE_BRIGHTNESS_FACTOR");

			if(render_settings.colorclip_factor)
				query.setMacro("USE_COLORCLIP_FACTOR");
		}

		if(this._current_renderframe && this._current_renderframe.use_extra_texture && gl.extensions["WEBGL_draw_buffers"])
			query.setMacro("USE_DRAW_BUFFERS");

		LEvent.trigger( scene, "fillSceneQuery", query );

		scene._query = query;
	},

	//Called at the beginning of renderInstances (once per renderFrame)
	//DO NOT CACHE, parameters can change between render passes
	fillSceneShaderUniforms: function( scene, render_settings )
	{
		//global uniforms
		var uniforms = {
			u_point_size: this.default_point_size,
			u_time: scene._time || getTime() * 0.001,
			u_brightness_factor: render_settings.brightness_factor != null ? render_settings.brightness_factor : 1,
			u_colorclip_factor: render_settings.colorclip_factor != null ? render_settings.colorclip_factor : 0,
			u_ambient_light: scene.info.ambient_color,
			u_background_color: scene.info.background_color.subarray(0,3),
			u_viewport: gl.viewport_data
		};

		if(render_settings.clipping_plane)
			uniforms.u_clipping_plane = render_settings.clipping_plane;

		if( this._current_pass.id == COLOR_PASS && render_settings.linear_pipeline )
			uniforms.u_gamma = 2.2;

		scene._uniforms = uniforms;
		scene._samplers = {};

		for(var i in scene.info.textures)
		{
			var texture = LS.getTexture( scene.info.textures[i] );
			if(!texture)
				continue;
			if(i != "environment" && i != "irradiance") continue; //TO DO: improve this, I dont want all textures to be binded 
			var type = (texture.texture_type == gl.TEXTURE_2D ? "_texture" : "_cubemap");
			if(texture.texture_type == gl.TEXTURE_2D)
			{
				texture.bind(0);
				texture.setParameter( gl.TEXTURE_MIN_FILTER, gl.LINEAR ); //avoid artifact
			}
			scene._samplers[i + type] = texture;
			scene._query.macros[ "USE_" + (i + type).toUpperCase() ] = "uvs_polar_reflected";
		}

		LEvent.trigger( scene, "fillSceneUniforms", scene._uniforms );
	},	

	/**
	* Switch flags according to the RenderInstance flags
	*
	* @method enableInstanceFlags
	* @param {RenderInstance} instance
	* @param {RenderSettings} render_settings
	*/
	enableInstanceFlags: function(instance, render_settings)
	{
		var flags = instance.flags;

		//backface culling
		if( flags & RI_CULL_FACE )
			gl.enable( gl.CULL_FACE );
		else
			gl.disable( gl.CULL_FACE );

		//  depth
		if(render_settings.depth_test)
		{
			gl.depthFunc( gl.LEQUAL );
			if( flags & RI_DEPTH_TEST )
				gl.enable( gl.DEPTH_TEST );
			else
				gl.disable( gl.DEPTH_TEST );

			if(flags & RI_DEPTH_WRITE)
				gl.depthMask(true);
			else
				gl.depthMask(false);
		}

		//when to reverse the normals?
		var order = gl.CCW;
		if(flags & RI_CW)
			order = gl.CW;
		if(render_settings.reverse_backfacing)
			order = order == gl.CW ? gl.CCW : gl.CW;
		gl.frontFace(order);
	},


	/**
	* Collects and process the rendering instances, cameras and lights that are visible
	* Its a prepass shared among all rendering passes
	* Warning: rendering order is computed here, so it is shared among all the cameras (TO DO, move somewhere else)
	*
	* @method processVisibleData
	* @param {SceneTree} scene
	* @param {RenderSettings} render_settings
	* @param {Array} cameras in case you dont want to use the scene cameras
	*/
	processVisibleData: function( scene, render_settings, cameras )
	{
		//options = options || {};
		//options.scene = scene;

		//update info about scene (collecting it all or reusing the one collected in the frame before)
		if( this._frame % this._collect_frequency == 0)
			scene.collectData();
		else
			scene.updateCollectedData();
		LEvent.trigger( scene, "afterCollectData", scene );

		cameras = cameras || scene._cameras;

		//prepare cameras
		for(var i = 0, l = cameras.length; i < l; ++i)
		{
			var camera = cameras[i];
			camera._rendering_index = i;
		}


		//meh!
		if(!this._main_camera)
		{
			if( cameras.length )
				this._main_camera = cameras[0];
			else
				this._main_camera = new LS.Camera(); // ??
		}

		var opaque_instances = [];
		var blend_instances = [];
		var materials = {}; //I dont want repeated materials here

		var instances = scene._instances;
		var camera = this._main_camera; // || scene.getCamera();
		var camera_eye = camera.getEye();

		//process render instances (add stuff if needed)
		for(var i = 0, l = instances.length; i < l; ++i)
		{
			var instance = instances[i];
			if(!instance)
				continue;
			var node_flags = instance.node.flags;

			if(!instance.mesh)
			{
				console.warn("RenderInstance must have mesh");
				continue;
			}

			//materials
			if(!instance.material)
				instance.material = this.default_material;
			materials[ instance.material.uid ] = instance.material;

			//add extra info
			instance._dist = vec3.dist( instance.center, camera_eye );

			//change conditionaly
			if(render_settings.force_wireframe && instance.primitive != gl.LINES ) 
			{
				instance.primitive = gl.LINES;
				if(instance.mesh)
				{
					if(!instance.mesh.indexBuffers["wireframe"])
						instance.mesh.computeWireframe();
					instance.index_buffer = instance.mesh.indexBuffers["wireframe"];
				}
			}

			//and finally, the alpha thing to determine if it is visible or not
			if(instance.flags & RI_BLEND)
				blend_instances.push(instance);
			else
				opaque_instances.push(instance);

			//node & mesh constant information
			var query = instance.query;
			if(instance.flags & RI_ALPHA_TEST || instance.material.alpha_test)
				query.macros.USE_ALPHA_TEST = "0.5";
			else if(query.macros["USE_ALPHA_TEST"])
				delete query.macros["USE_ALPHA_TEST"];

			var buffers = instance.vertex_buffers;
			if(!("normals" in buffers))
				query.macros.NO_NORMALS = "";
			if(!("coords" in buffers))
				query.macros.NO_COORDS = "";
			if(("coords1" in buffers))
				query.macros.USE_COORDS1_STREAM = "";
			if(("colors" in buffers))
				query.macros.USE_COLOR_STREAM = "";
			if(("tangents" in buffers))
				query.macros.USE_TANGENT_STREAM = "";

			instance._camera_visibility = 0|0;
		}

		//Sorting: (defining rendering order based on RIs priority and distance to camera)
		if(render_settings.sort_instances_by_distance) //sort RIs in Z for alpha sorting
		{
			opaque_instances.sort(this._sort_near_to_far_func);
			blend_instances.sort(this._sort_far_to_near_func);
		}

		if(render_settings.sort_instances_by_priority) //sort by priority (we do this before merging because otherwise the distance sorting gest messed up
		{
			opaque_instances.sort(this._sort_by_priority_and_near_to_far_func);
			blend_instances.sort(this._sort_by_priority_and_far_to_near_func);
		}

		var all_instances = opaque_instances.concat(blend_instances); //merge

		//update materials info only if they are in use
		if(render_settings.update_materials)
			this._prepareMaterials( materials, scene );

		//pack all macros, uniforms, and samplers relative to this instance in single containers
		for(var i = 0, l = instances.length; i < l; ++i)
		{
			var instance = instances[i];
			var node = instance.node;
			var material = instance.material;

			var query = instance._final_query;
			query.clear();
			query.add( node._query );
			query.add( material._query );
			query.add( instance.query );

			var uniforms = instance._final_uniforms;
			wipeObject( uniforms );
			uniforms.merge( node._uniforms );
			uniforms.merge( material._uniforms );
			uniforms.merge( instance.uniforms );

			var samplers = instance._final_samplers;
			wipeObject(samplers);
			//samplers.merge( node._samplers );
			samplers.merge( material._samplers );
			samplers.merge( instance.samplers );			
		}


		var lights = scene._lights;

		this._blend_instances = blend_instances;
		this._opaque_instances = opaque_instances;
		this._visible_instances = all_instances; //sorted version
		this._visible_lights = scene._lights;
		this._visible_cameras = cameras; 
		this._visible_materials = materials;

		//prepare lights (collect data and generate shadowmaps)
		for(var i = 0, l = lights.length; i < l; ++i)
			lights[i].prepare( render_settings );
	},

	//outside of processVisibleData to allow optimizations in processVisibleData
	_prepareMaterials: function( materials, scene )
	{
		for(var i in materials)
		{
			var material = materials[i];
			material.prepareMaterial( scene );
		}
	},

	_sort_far_to_near_func: function(a,b) { return b._dist - a._dist; },
	_sort_near_to_far_func: function(a,b) { return a._dist - b._dist; },
	_sort_by_priority_func: function(a,b) { return b.priority - a.priority; },
	_sort_by_priority_and_near_to_far_func: function(a,b) { var r = b.priority - a.priority; return r ? r : (a._dist - b._dist) },
	_sort_by_priority_and_far_to_near_func: function(a,b) { var r = b.priority - a.priority; return r ? r : (b._dist - a._dist) },

	/**
	* Renders a frame into a texture (could be a cubemap, in which case does the six passes)
	*
	* @method renderInstancesToRT
	* @param {Camera} cam
	* @param {Texture} texture
	* @param {RenderSettings} render_settings
	*/
	renderInstancesToRT: function(cam, texture, render_settings)
	{
		render_settings = render_settings || this.default_render_settings;
		this._current_target = texture;
		var scene = LS.Renderer._current_scene;

		if(texture.texture_type == gl.TEXTURE_2D)
		{
			this.enableCamera(cam, render_settings);
			texture.drawTo( inner_draw_2d );
		}
		else if( texture.texture_type == gl.TEXTURE_CUBE_MAP)
			this.renderToCubemap( cam.getEye(), texture.width, texture, render_settings, cam.near, cam.far );
		this._current_target = null;

		function inner_draw_2d()
		{
			gl.clearColor(scene.info.background_color[0], scene.info.background_color[1], scene.info.background_color[2], scene.info.background_color[3] );
			if(render_settings.ignore_clear != true)
				gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
			//render scene
			LS.Renderer.renderInstances( render_settings );
		}
	},

	/**
	* Renders the current scene to a cubemap centered in the given position
	*
	* @method renderToCubemap
	* @param {vec3} position center of the camera where to render the cubemap
	* @param {number} size texture size
	* @param {Texture} texture to reuse the same texture
	* @param {RenderSettings} render_settings
	* @param {number} near
	* @param {number} far
	* @return {Texture} the resulting texture
	*/
	renderToCubemap: function(position, size, texture, render_settings, near, far)
	{
		size = size || 256;
		near = near || 1;
		far = far || 1000;

		var eye = position;
		if( !texture || texture.constructor != GL.Texture)
			texture = null;

		var scene = this._current_scene;

		texture = texture || new GL.Texture(size,size,{texture_type: gl.TEXTURE_CUBE_MAP, minFilter: gl.NEAREST});
		this._current_target = texture;
		texture.drawTo( function(texture, side) {

			var info = LS.Camera.cubemap_camera_parameters[side];
			if(texture._is_shadowmap || !scene.info )
				gl.clearColor(0,0,0,0);
			else
				gl.clearColor( scene.info.background_color[0], scene.info.background_color[1], scene.info.background_color[2], scene.info.background_color[3] );

			gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
			var cubemap_cam = new LS.Camera({ eye: eye, center: [ eye[0] + info.dir[0], eye[1] + info.dir[1], eye[2] + info.dir[2]], up: info.up, fov: 90, aspect: 1.0, near: near, far: far });

			LS.Renderer.enableCamera( cubemap_cam, render_settings, true );
			LS.Renderer.renderInstances( render_settings );
		});

		this._current_target = null;
		return texture;
	},

	/**
	* Renders the material preview to an image (or to the screen)
	*
	* @method renderMaterialPreview
	* @param {Material} material
	* @param {number} size image size
	* @param {Object} options could be environment_texture, to_viewport
	* @return {Image} the preview image (in canvas format) or null if it was rendered to the viewport
	*/
	renderMaterialPreview: function( material, size, options )
	{
		options = options || {};

		var scene = this._material_scene;
		if(!scene)
		{
			scene = this._material_scene = new LS.SceneTree();
			if(options.background_color)
				scene.info.background_color.set(options.background_color);
			else
				scene.info.background_color.set([0.0,0.0,0.0,0]);
			if(options.environment_texture)
				scene.info.textures.environment = options.environment_texture;
			var node = new LS.SceneNode( "sphere" );
			var compo = new LS.Components.GeometricPrimitive( { size: 40, subdivisions: 50, geometry: LS.Components.GeometricPrimitive.SPHERE } );
			node.addComponent( compo );
			scene.root.addChild( node );
		}

		var node = scene.getNode( "sphere");
		if(!node)
		{
			console.error("Node not found in Material Preview Scene");
			return null;
		}

		if(options.rotate)
			node.transform.rotateY( options.rotate );
		node.material = material;

		if(options.to_viewport)
		{
			LS.Renderer.renderFrame( scene.root.camera, { skip_viewport: true, render_helpers: false, update_materials: true }, scene );
			return;
		}

		var tex = this._material_preview_texture || new GL.Texture(size,size);
		if(!this._material_preview_texture)
			this._material_preview_texture = tex;

		tex.drawTo( function()
		{
			//it already clears everything
			//just render
			LS.Renderer.renderFrame( scene.root.camera, { skip_viewport: true, render_helpers: false }, scene );
		});

		var canvas = tex.toCanvas(null, true);
		//document.body.appendChild( canvas ); //debug
		return canvas;
	},

	/**
	* Returns the last camera that falls into a given screen position
	*
	* @method getCameraAtPosition
	* @param {number} x
	* @param {number} y
	* @param {SceneTree} scene if not specified last rendered scene will be used
	* @return {Camera} the camera
	*/
	getCameraAtPosition: function(x,y, cameras)
	{
		cameras = cameras || this._visible_cameras;
		if(!cameras || !cameras.length)
			return null;

		for(var i = cameras.length - 1; i >= 0; --i)
		{
			var camera = cameras[i];
			if(!camera.enabled || camera.render_to_texture)
				continue;

			if( camera.isPointInCamera(x,y) )
				return camera;
		}
		return null;
	},

	/**
	* Sets the render pass to use, this allow to change between "color","shadow","picking",etc
	*
	* @method setRenderPass
	* @param {String} name name of the render pass as in render_passes
	*/
	setRenderPass: function( name )
	{
		this._current_pass = this.render_passes[ name ] || this.render_passes[ "color" ];
	},

	/**
	* Register a render pass to be used during the rendering
	*
	* @method registerRenderPass
	* @param {String} name name of the render pass as in render_passes
	* @param {Object} info render pass info, { render_instance: Function( instance, render_settings ) }
	*/
	registerRenderPass: function( name, info )
	{
		info.name = name;
		this.render_passes[ name ] = info;
		if(!this._current_pass)
			this._current_pass = info;
	}
};

//Add to global Scope
LS.Renderer = Renderer;

//
/**
* Picking is used to detect which element is below one pixel (used the GPU) or using raycast
*
* @class Picking
* @namespace LS
* @constructor
*/
var Picking = {

	/**
	* Renders the pixel and retrieves the color to detect which object it was, slow but accurate
	* @method getNodeAtCanvasPosition
	* @param {number} x in canvas coordinates
	* @param {number} y in canvas coordinates
	* @param {Camera} camera default is all cameras
	* @param {number} layers default is 0xFFFF which is all
	* @param {SceneTree} scene default is GlobalScene
	*/
	getNodeAtCanvasPosition: function( x, y, camera, layers, scene )
	{
		var instance = this.getInstanceAtCanvasPosition( x, y, camera, layers, scene );
		if(!instance)
			return null;

		if(instance.constructor == LS.SceneNode)
			return instance;

		if(instance._root && instance._root.constructor == LS.SceneNode)
			return instance._root;

		if(instance.node)
			return instance.node;

		return null;
	},

	/**
	* Returns the instance under a screen position
	* @method getInstanceAtCanvasPosition
	* @param {number} x in canvas coordinates
	* @param {number} y in canvas coordinates
	* @param {Camera} camera
	* @param {number} layers default is 0xFFFF which is all
	* @param {SceneTree} scene
	* @return {Object} the info supplied by the picker (usually a SceneNode)
	*/
	getInstanceAtCanvasPosition: function( x, y, camera, layers, scene )
	{
		scene = scene || LS.GlobalScene;

		if(!camera)
			camera = LS.Renderer.getCameraAtPosition( x, y, scene._cameras );

		if(!camera)
			return null;

		this._picking_nodes = {};

		//render all Render Instances
		this.renderPickingBuffer( scene, camera, x,y, layers );

		this._picking_color[3] = 0; //remove alpha, because alpha is always 255
		var id = new Uint32Array(this._picking_color.buffer)[0]; //get only element

		var instance_info = this._picking_nodes[id];
		this._picking_nodes = {};
		return instance_info;
	},	

	/**
	* Cast a ray that traverses the scene checking for collisions with RenderInstances
	* Similar to Physics.raycast but using only the bounding boxes of the visible meshes
	* @method raycast
	* @param {vec3} origin in world space
	* @param {vec3} direction in world space
	* @param {Object} options ( max_distance: maxium ray distance, layers, scene, max_distance, first_collision : returns the first collision (which could be not the closest one) )
	* @return {Array} array containing all the RenderInstances that collided with the ray in the form [SceneNode, RenderInstance, collision point, distance]
	*/
	raycast: function( origin, direction, options )
	{
		options = options || {};
		var layers = options.layers;
		if(layers === undefined)
			layers = 0xFFFF;
		var max_distance = options.max_distance || Number.MAX_VALUE;
		var scene = options.scene || LS.GlobalScene;
		var triangle_collision = options.triangle_collision;
		var first_collision = options.first_collision;

		var instances = scene._instances;
		if(!instances || !instances.length)
			return null;

		var collisions = [];

		var local_start = vec3.create();
		var local_direction = vec3.create();

		var compute_normal = !!options.normal;

		//for every instance
		for(var i = 0; i < instances.length; ++i)
		{
			var instance = instances[i];

			if(!(instance.flags & RI_RAYCAST_ENABLED) || (layers & instance.layers) === 0 )
				continue;

			if(instance.flags & RI_BLEND)
				continue; //avoid semitransparent

			//test against AABB
			var collision_point = vec3.create();
			if( !geo.testRayBBox( origin, direction, instance.aabb, null, collision_point, max_distance ) )
				continue;

			var model = instance.matrix;

			//ray to local
			var inv = mat4.invert( mat4.create(), model );
			mat4.multiplyVec3( local_start, inv, origin );
			mat4.rotateVec3( local_direction, inv, direction );

			//test against OOBB (a little bit more expensive)
			if( !geo.testRayBBox(local_start, local_direction, instance.oobb, null, collision_point, max_distance) )
				continue;

			//test against mesh
			var collision_mesh = instance.collision_mesh;
			var collision_normal = null;
			
			if(triangle_collision)
				collision_mesh = instance.lod_mesh || instance.mesh;

			if( collision_mesh )
			{
				var mesh = collision_mesh;
				var octree = mesh.octree;
				if(!octree)
					octree = mesh.octree = new GL.Octree( mesh );
				var hit = octree.testRay( local_start, local_direction, 0.0, max_distance );
				if(!hit)
					continue;
				mat4.multiplyVec3( collision_point, model, hit.pos );
				if(compute_normal)
					collision_normal = mat4.rotateVec3( vec3.create(), model, hit.normal );
			}
			else
				vec3.transformMat4(collision_point, collision_point, model);

			var distance = vec3.distance( origin, collision_point );
			if(distance < max_distance)
				collisions.push( new LS.Collision( instance.node, instance, collision_point, distance, collision_normal ) );

			if(first_collision)
				return collisions;
		}

		collisions.sort( LS.Collision.isCloser );
		return collisions;
	},

	/**
	* Returns a color you should use to paint this node during picking rendering
	* you tell what info you want to retrieve associated with this object if it is clicked
	* @method getNextPickingColor
	* @param {*} info
	* @return {vec3} array containing all the RenderInstances that collided with the ray
	*/
	getNextPickingColor: function( info )
	{
		this._picking_next_color_id += 10;
		var pick_color = new Uint32Array(1); //store four bytes number
		pick_color[0] = this._picking_next_color_id; //with the picking color for this object
		var byte_pick_color = new Uint8Array( pick_color.buffer ); //read is as bytes
		//byte_pick_color[3] = 255; //Set the alpha to 1

		this._picking_nodes[ this._picking_next_color_id ] = info;
		return vec4.fromValues( byte_pick_color[0] / 255, byte_pick_color[1] / 255, byte_pick_color[2] / 255, 1 );
	},

	//picking
	_pickingMap: null,
	_picking_color: new Uint8Array(4),
	_picking_depth: 0,
	_picking_next_color_id: 0,
	_picking_nodes: {},
	_picking_render_settings: new RenderSettings(),

	renderPickingBuffer: function( scene, camera, x, y, layers )
	{
		var that = this;
		if(layers === undefined)
			layers = 0xFFFF;

		if(this._pickingMap == null || this._pickingMap.width != gl.canvas.width || this._pickingMap.height != gl.canvas.height )
		{
			this._pickingMap = new GL.Texture( gl.canvas.width, gl.canvas.height, { format: gl.RGBA, filter: gl.NEAREST });
			//LS.ResourcesManager.textures[":picking"] = this._pickingMap; //debug the texture
		}

		//y = gl.canvas.height - y; //reverse Y
		var small_area = true;
		this._picking_next_color_id = 0;

		LS.Renderer._current_target = this._pickingMap;
		var picking_render_settings = this._picking_render_settings;

		this._pickingMap.drawTo(function() {
			//var viewport = camera.getLocalViewport();
			//camera._real_aspect = viewport[2] / viewport[3];
			//gl.viewport( viewport[0], viewport[1], viewport[2], viewport[3] );

			LS.Renderer.enableCamera( camera, that._picking_render_settings );

			if(small_area)
			{
				gl.scissor(x-1,y-1,2,2);
				gl.enable(gl.SCISSOR_TEST);
			}

			gl.clearColor(0,0,0,0);
			gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

			//gl.viewport(x-20,y-20,40,40);
			LS.Renderer.setRenderPass("picking");
			picking_render_settings.layers = layers;

			//check instances colliding with cursor using a ray against AABBs
			//TODO

			LS.Renderer.renderInstances( picking_render_settings )//, cursor_instances );
			//gl.scissor(0,0,gl.canvas.width,gl.canvas.height);

			LEvent.trigger( scene, "renderPicking", [x,y] );
			LEvent.trigger( LS.Renderer, "renderPicking", [x,y] );

			LS.Renderer.setRenderPass("color");

			gl.readPixels(x,y,1,1,gl.RGBA,gl.UNSIGNED_BYTE, that._picking_color );

			if(small_area)
				gl.disable(gl.SCISSOR_TEST);

		});

		LS.Renderer._current_target = null;

		//if(!this._picking_color) this._picking_color = new Uint8Array(4); //debug
		//trace(" END Rendering: ", this._picking_color );
		return this._picking_color;
	}
};

LS.Picking = Picking;
/* This is in charge of basic physics actions like ray tracing against the colliders */

/**
* Contains information about the collision of a ray and the scene
* - position: vec3
* - node: SceneNode
* - instance: could be a RenderInstance or a PhysicsInstance
* - distance: number
* @class Collision
* @namespace LS
* @constructor
* @param {SceneNode} node
* @param {PhysicsInstance|RenderInstance} instance
* @param {vec3} position collision position
* @param {number} distance
*/
function Collision( node, instance, position, distance, normal )
{
	this.position = vec3.create();
	if(position)
		this.position.set(position);
	this.node = node || null; //the node belonging to this colliding object
	this.instance = instance || null; //could be a RenderInstance or a PhysicsInstance
	this.distance = distance || 0; //distance from the ray start
	this.normal = normal;
}

Collision.isCloser = function(a,b) { return a.distance - b.distance; }

LS.Collision = Collision;





/**
* PhysicsInstance contains info of a colliding object. Used to test collisions with the scene
*
* @class PhysicsInstance
* @namespace LS
* @constructor
*/
function PhysicsInstance(node, component)
{
	this.uid = LS.generateUId("PHSX"); //unique identifier for this RI
	this.layers = 3|0;

	this.type = PhysicsInstance.BOX; //SPHERE, MESH
	this.mesh = null; 

	//where does it come from
	this.node = node;
	this.component = component;

	//transformation
	this.matrix = mat4.create();
	this.center = vec3.create(); //in world space

	//for visibility computation
	this.oobb = BBox.create(); //local object oriented bounding box
	this.aabb = BBox.create(); //world axis aligned bounding box
}

PhysicsInstance.BOX = 1;
PhysicsInstance.SPHERE = 2;
PhysicsInstance.PLANE = 3;
PhysicsInstance.CAPSULE = 4;
PhysicsInstance.MESH = 5;
PhysicsInstance.FUNCTION = 6; //used to test against a internal function

/**
* Computes the instance bounding box in world space from the one in local space
*
* @method updateAABB
*/
PhysicsInstance.prototype.updateAABB = function()
{
	BBox.transformMat4( this.aabb, this.oobb, this.matrix );
}

PhysicsInstance.prototype.setMesh = function(mesh)
{
	this.mesh = mesh;
	this.type = PhysicsInstance.MESH;	
	BBox.setCenterHalfsize( this.oobb, BBox.getCenter( mesh.bounding ), BBox.getHalfsize( mesh.bounding ) );
}

LS.PhysicsInstance = PhysicsInstance;



/**
* Physics is in charge of all physics testing methods
*
* @class Physics
* @namespace LS
* @constructor
*/
var Physics = {

	/**
	* Cast a ray that traverses the scene checking for collisions with Colliders
	* @method raycast
	* @param {vec3} origin in world space
	* @param {vec3} direction in world space
	* @param {Object} options ( max_dist maxium distance, layers which layers to check, scene, first_collision )
	* @return {Array} Array of Collision objects containing all the nodes that collided with the ray or null in the form [SceneNode, Collider, collision point, distance]
	*/
	raycast: function( origin, direction, options )
	{
		options = options || {};
		var layers = options.layers;
		if(layers === undefined)
			layers = 0xFFFF;
		var max_distance = options.max_distance || Number.MAX_VALUE;
		var scene = options.scene || LS.GlobalScene;
		var first_collision = options.first_collision;

		var colliders = options.colliders || scene._colliders;
		var collisions = [];

		var compute_normal = !!options.normal;

		if(!colliders)
			return null;

		var local_start = vec3.create();
		var local_direction = vec3.create();

		//for every instance
		for(var i = 0; i < colliders.length; ++i)
		{
			var instance = colliders[i];

			if( (layers & instance.layers) === 0 )
				continue;

			//test against AABB
			var collision_point = vec3.create();
			var collision_normal = null;
			if( !geo.testRayBBox(origin, direction, instance.aabb, null, collision_point, max_distance) )
				continue;

			var model = instance.matrix;

			//spheres are tested in world space, is cheaper (if no non-uniform scales...)
			if( instance.type == PhysicsInstance.SPHERE )
			{
				if(!geo.testRaySphere( origin, direction, instance.center, instance.oobb[3], collision_point, max_distance))
					continue;
				if(compute_normal)
					collision_normal = vec3.sub( vec3.create(), collision_point, instance.center );
			}
			else //the rest test first with the local BBox
			{
				//ray to local instance coordinates
				var inv = mat4.invert( mat4.create(), model );
				mat4.multiplyVec3( local_start, inv, origin);
				mat4.rotateVec3( local_direction, inv, direction);

				//test against OOBB (a little bit more expensive)
				if( !geo.testRayBBox( local_start, local_direction, instance.oobb, null, collision_point, max_distance) )
					continue;

				//if mesh use Octree
				if( instance.type == PhysicsInstance.MESH )
				{
					var octree = instance.mesh.octree;
					if(!octree)
						octree = instance.mesh.octree = new GL.Octree( instance.mesh );
					var hit = octree.testRay( local_start, local_direction, 0.0, max_distance );
					if(!hit)
						continue;

					mat4.multiplyVec3( collision_point, model, hit.pos );
					if(compute_normal)
						collision_normal = mat4.rotateVec3( vec3.create(), model, hit.normal );
				}
				else //if just a BBox collision
				{
					vec3.transformMat4( collision_point, collision_point, model );
				}
			}

			var distance = vec3.distance( origin, collision_point );
			collisions.push( new LS.Collision( instance.node, instance, collision_point, distance, collision_normal ));

			if(first_collision)
				return collisions;
		}

		//sort collisions by distance
		collisions.sort( Collision.isCloser );
		return collisions;
	},

	/**
	* Test if a sphere collides with any of the colliders in the scene
	* @method testSphere
	* @param {vec3} origin in world space
	* @param {radius} radius
	* @param {Object} options layers, colliders, scene
	* @return {PhysicsInstance} the first PhysicsObject that collided with, otherwise null
	*/
	testSphere: function( origin, radius, options )
	{
		options = options || {};
		var layers = options.layers;
		if(layers === undefined)
			layers = 0xFFFF;
		var scene = options.scene || LS.GlobalScene;

		var colliders = options.colliders || scene._colliders;
		var collisions = [];

		var local_start = vec3.create();

		if(!colliders)
			return null;

		//for every instance
		for(var i = 0; i < colliders.length; ++i)
		{
			var instance = colliders[i];

			if( (layers & instance.layers) === 0 )
				continue;

			//test against AABB
			if( !geo.testSphereBBox( origin, radius, instance.aabb ) )
				continue;

			var model = instance.matrix;

			//ray to local
			var inv = mat4.invert( mat4.create(), model );
			mat4.multiplyVec3( local_start, inv, origin);

			//test in world space, is cheaper
			if( instance.type == LS.PhysicsInstance.SPHERE)
			{
				if( vec3.distance( origin, local_start ) > (radius + BBox.getRadius(instance.oobb)) )
					continue;
			}
			else //the rest test first with the local BBox
			{
				//test against OOBB (a little bit more expensive)
				if( !geo.testSphereBBox( local_start, radius, instance.oobb) )
					continue;

				if( instance.type == LS.PhysicsInstance.MESH )
				{
					var octree = instance.mesh.octree;
					if(!octree)
						octree = instance.mesh.octree = new GL.Octree( instance.mesh );
					if( !octree.testSphere( local_start, radius ) )
						continue;
				}
			}

			return instance;
		}

		return null;
	},

	testCollision: function( A, B )
	{
		//test AABBs
		if( !geo.testBBoxBBox( A.aabb, B.aabb ) )
			return false;

		return true; //TODO

		//conver A to B local Space

		//test box box

		//test box sphere

		//test box mesh

		//test sphere box

		//test sphere sphere

		//mesh mesh not supported

		return true;
	},

	testAllCollisions: function( on_collision, layers, scene )
	{
		if(layers === undefined)
			layers = 0xFFFF;
		scene = scene || LS.GlobalScene;

		var colliders = scene._colliders;
		var l = colliders.length;

		var collisions = false;

		for(var i = 0; i < l; ++i)
		{
			var instance_A = colliders[i];

			if( (layers & instance_A.layers) === 0 )
				continue;

			for(var j = i+1; j < l; ++j)
			{
				var instance_B = colliders[j];

				if( (layers & instance_B.layers) === 0 )
					continue;

				if( this.testCollision( instance_A, instance_B ) )
				{
					if(on_collision)
						on_collision( instance_A, instance_B );
					collisions = true;
				}
			}
		}

		return collisions;
	}
}


LS.Physics = Physics;
/**
* Formats is the class where all the info about what is every format, how to parse it, etc, is located
*
* @class LS.Formats
* @param{String} id the id (otherwise a random one is computed)
* @constructor
*/
LS.Formats = {

	//all the supported file formats and their parsers
	supported: {},

	safe_parsing: false, //catch exceptions during parsing
	merge_smoothgroups: false,

	/**
	* Tells the system info about this file format
	* Info should contain fields like type:"image", resource: "Mesh|Texture", format: "text|binary", parse: function, native: true|false
	* 
	* @method addFormat
	*/
	addSupportedFormat: function( extensions, info )
	{
		if( extensions.constructor === String )
			extensions = extensions.split(",");

		for(var i = 0; i < extensions.length; ++i)
		{
			var extension = extensions[i].toLowerCase();
			if( this.supported[ extension ] )
				console.warn("There is already another parser associated to this extension: " + extension);
			this.supported[ extension ] = info;
		}
	},

	//register a parser in case the system needs to parse a file
	registerParser: function( parser )
	{
		this.addSupportedFormat( parser.extension, parser );
	},

	/**
	* Parse some data and returns the resulting resource
	* 
	* @method parse
	* @param {string} filename
	* @param {*} data could be a string, binary, arraybuffer, xml...
	* @param {Object} options how the file should be parsed
	* @return {*} the final resource, could be a Texture, a Mesh, or an object
	*/
	parse: function( filename, data, options)
	{
		options = options || {};
		var info = this.getFileFormatInfo( filename );
		if(options.extension)
			info.extension = options.extension; //force a format
		else
			info.extension = LS.ResourcesManager.getExtension( filename );

		var format = this.supported[ info.extension ];
		if(!format || !format.parse)
		{
			console.error("Parser Error: No parser found for " + info.extension + " format");
			return null;
		}

		var result = null;
		if(!this.safe_parsing)
			result = format.parse( data, options, filename );
		else
			try
			{
				result = format.parse( data, options, filename );
			}
			catch (err)
			{
				console.error("Error parsing content", err );
				return null;
			}
		if(result)
			result.name = filename;
		return result;
	},

	//Returns info about a resource according to its filename
	TEXT_FORMAT: "text",
	JSON_FORMAT: "json",
	XML_FORMAT: "xml",
	BINARY_FORMAT: "binary",

	MESH_DATA: "MESH",
	IMAGE_DATA: "IMAGE",
	NONATIVE_IMAGE_DATA: "NONATIVE_IMAGE",
	SCENE_DATA: "SCENE",
	GENERIC_DATA: "GENERIC",
	
	getFileFormatInfo: function( filename )
	{
		var extension = filename.substr( filename.lastIndexOf(".") + 1).toLowerCase();
		return this.supported[ extension ];
	},

	guessType: function( filename )
	{
		if(!filename)
			return null;

		var ext = LS.RM.getExtension( filename ).toLowerCase();
		var info = this.supported[ ext ];
		if(!info)
			return null;
		return info.resource;
	},

	//Helpers ******************************

	//gets raw image information {width,height,pixels:ArrayBuffer} and create a dataurl to use in images
	convertToDataURL: function( img_data )
	{
		var canvas = document.createElement("canvas");
		canvas.width = img_data.width;
		canvas.height = img_data.height;
		//document.body.appendChild(canvas);
		var ctx = canvas.getContext("2d");
		var pixelsData = ctx.createImageData(img_data.width, img_data.height);
		var num_pixels = canvas.width * canvas.height;

		//flip and copy the pixels
		if(img_data.bytesPerPixel == 3)
		{
			for(var i = 0; i < canvas.width; ++i)
				for(var j = 0; j < canvas.height; ++j)
				{
					var pos = j*canvas.width*4 + i*4;
					var pos2 = (canvas.height - j - 1)*canvas.width*3 + i*3;
					pixelsData.data[pos+2] = img_data.pixels[pos2];
					pixelsData.data[pos+1] = img_data.pixels[pos2+1];
					pixelsData.data[pos+0] = img_data.pixels[pos2+2];
					pixelsData.data[pos+3] = 255;
				}
		}
		else {
			for(var i = 0; i < canvas.width; ++i)
				for(var j = 0; j < canvas.height; ++j)
				{
					var pos = j*canvas.width*4 + i*4;
					var pos2 = (canvas.height - j - 1)*canvas.width*4 + i*4;
					pixelsData.data[pos+0] = img_data.pixels[pos2+2];
					pixelsData.data[pos+1] = img_data.pixels[pos2+1];
					pixelsData.data[pos+2] = img_data.pixels[pos2+0];
					pixelsData.data[pos+3] = img_data.pixels[pos2+3];
				}
		}

		ctx.putImageData(pixelsData,0,0);
		img_data.dataurl = canvas.toDataURL("image/png");
		return img_data.dataurl;
	},

	/* extract important Mesh info from vertices (center, radius, bouding box) */
	computeMeshBounding: function(vertices)
	{
		//compute AABB and useful info
		var min = [vertices[0],vertices[1],vertices[2]];
		var max = [vertices[0],vertices[1],vertices[2]];
		for(var i = 0; i < vertices.length; i += 3)
		{
			var v = [vertices[i],vertices[i+1],vertices[i+2]];
			if (v[0] < min[0]) min[0] = v[0];
			else if (v[0] > max[0]) max[0] = v[0];
			if (v[1] < min[1]) min[1] = v[1];
			else if (v[1] > max[1]) max[1] = v[1];
			if (v[2] < min[2]) min[2] = v[2];
			else if (v[2] > max[2]) max[2] = v[2];
		}

		var center = [(min[0] + max[0]) * 0.5,(min[1] + max[1]) * 0.5, (min[2] + max[2]) * 0.5];
		var halfsize = [ min[0] - center[0], min[1] - center[1], min[2] - center[2]];
		return BBox.setCenterHalfsize( BBox.create(), center, halfsize );
	}
};

//native formats do not need parser
LS.Formats.addSupportedFormat( "png,jpg,jpeg,webp,bmp,gif", { "native": true, dataType: "arraybuffer", resource: "Texture", "resourceClass": GL.Texture, has_preview: true, type: "image" } );
LS.Formats.addSupportedFormat( "wbin", { dataType: "arraybuffer" } );
LS.Formats.addSupportedFormat( "json,js,txt,csv", { dataType: "string" } );
WBin.classes = LS.Classes; //WBin need to know which classes are accesible to be instantiated right from the WBin data info, in case the class is not a global class

/*
	image_extensions: ["png","jpg"], //for images
	nonative_image_extensions: ["tga","dds"], //for images that need parsing
	mesh_extensions: ["obj", "bin","ase","gr2","json","jsmesh"], //for meshes
	scene_extensions: ["dae"], //for scenes
	generic_extensions: ["xml","js","json"], //unknown data container
	xml_extensions: ["xml","dae"], //for sure is XML
	json_extensions: ["js","json"], //for sure is JSON
	binary_extensions: ["bin","tga","dds"], //for sure is binary and needs to be read as a byte array
*/



//parsers usually need this
//takes an string an returns a Uint8Array typed array containing that string
function stringToTypedArray(str, fixed_length)
{
	var r = new Uint8Array( fixed_length ? fixed_length : str.length);
	for(var i = 0; i < str.length; i++)
		r[i] = str.charCodeAt(i);
	return r;
}

//takes a typed array with ASCII codes and returns the string
function typedArrayToString(typed_array, same_size)
{
	var r = "";
	for(var i = 0; i < typed_array.length; i++)
		if (typed_array[i] == 0 && !same_size)
			break;
		else
			r += String.fromCharCode( typed_array[i] );
	return r;
}
//***** ASE Parser *****************
var parserASE = {
	extension: "ase",
	type: "mesh",
	resource: "Mesh",
	format: 'text',
	dataType:'text',
	
	parse: function( text, options, filename )
	{
		options = options || {};

		//final arrays (packed, lineal [ax,ay,az, bx,by,bz ...])
		var positionsArray = [ ];
		var normalsArray   = [ ];
		var indicesArray   = [ ];

		var uvs_container = [ ];
		var current_uvs = null;


		//unique arrays (not packed, lineal)
		var positions = [ ];
		var normals   = [ ];
		var indices = [ ];
		var tvertlist = [ ];
		var facemap   = { };
		var index     = 0;

		var line = null;
		var f   = null;
		var pos = 0;
		var tex = 0;
		var nor = 0;
		var x   = 0.0;
		var y   = 0.0;
		var z   = 0.0;
		var tokens = null;

		var indices_offset = 0;
		var mesh_index = 0;
		var current_mat_id = -1;
		var current_mesh_name = "";

		//used for mesh groups (submeshes)
		var group = null;
		var groups = [];

		var flip_axis = this.flipAxis;
		if(options.flipAxis != null) flip_axis = options.flipAxis;
		var flip_normals = (flip_axis || options.flipNormals);

		var lines = text.split("\n");
		for (var lineIndex = 0;  lineIndex < lines.length; ++lineIndex) {
			line = lines[lineIndex].replace(/[ \t]+/g, " ").replace(/\s\s*$/, ""); //trim
			if(line[0] == " ")
				line = line.substr(1,line.length);

			if(line == "") continue;
			tokens = line.split(" ");

			if(tokens[0] == "*MESH")
			{
				mesh_index += 1;
				positions = [];

				if(mesh_index > 1)
					break; //parse only the first mesh
			}
			else if (tokens[0] == "*NODE_NAME") {
				current_mesh_name =  tokens[1].substr(1, tokens[1].length - 2);
			}
			else if(tokens[0] == "*MESH_VERTEX")
			{
				if(flip_axis) //maya and max notation style
					positions.push( [-1*parseFloat(tokens[2]), parseFloat(tokens[4]), parseFloat(tokens[3])] );
				else
					positions.push( [parseFloat(tokens[2]), parseFloat(tokens[3]), parseFloat(tokens[4])] );
			}
			else if(tokens[0] == "*MESH_FACE")
			{
				//material info
				var mat_id = parseInt( tokens[17] );
				if(current_mat_id != mat_id)
				{
					current_mat_id = mat_id;
					if(group != null)
					{
						group.length = positionsArray.length / 3 - group.start;
						if(group.length > 0)
							groups.push(group);
					}

					group = {
						name: "mat_" + mat_id,
						start: positionsArray.length / 3,
						length: -1,
						material: ""
					};
				}

				//add vertices
				var vertex = positions[ parseInt(tokens[3]) ];
				positionsArray.push( vertex[0], vertex[1], vertex[2] );
				vertex = positions[ parseInt(tokens[5]) ];
				positionsArray.push( vertex[0], vertex[1], vertex[2] );
				vertex = positions[ parseInt(tokens[7]) ];
				positionsArray.push( vertex[0], vertex[1], vertex[2] );
			}
			else if(tokens[0] == "*MESH_TVERTLIST")
			{
				tvertlist = [];
			}
			else if(tokens[0] == "*MESH_TVERT")
			{
				tvertlist.push( [parseFloat(tokens[2]), parseFloat(tokens[3])] );
			}
			else if(tokens[0] == "*MESH_TFACELIST")
			{
				if( current_uvs && current_uvs.length )
					uvs_container.push( current_uvs );
				current_uvs = [];
			}
			else if(tokens[0] == "*MESH_TFACE")
			{
				var coord = tvertlist[ parseInt(tokens[2]) ];
				current_uvs.push( coord[0], coord[1] );
				coord = tvertlist[ parseInt(tokens[3]) ];
				current_uvs.push( coord[0], coord[1] );
				coord = tvertlist[ parseInt(tokens[4]) ];
				current_uvs.push( coord[0], coord[1] );
			}
			else if(tokens[0] == "*MESH_MAPPINGCHANNEL")
			{
				if( current_uvs )
					uvs_container.push( current_uvs );
				current_uvs = [];
			}
			else if(tokens[0] == "*MESH_VERTEXNORMAL")
			{
				if(flip_normals)  //maya and max notation style
					normalsArray.push(-1*parseFloat(tokens[2]),parseFloat(tokens[4]),parseFloat(tokens[3]));
				else
					normalsArray.push(parseFloat(tokens[2]),parseFloat(tokens[3]),parseFloat(tokens[4]));
			}
		}

		if(current_uvs)
			uvs_container.push( current_uvs );

		var total_primitives = positionsArray.length / 3 - group.start;
		if(group && total_primitives > 1)
		{
			group.length = total_primitives;
			groups.push(group);
		}

		var mesh = { info: {} };

		mesh.vertices = new Float32Array(positionsArray);
		if (normalsArray.length > 0)
			mesh.normals = new Float32Array(normalsArray);
		for(var i = 0; i < uvs_container.length; ++i )
		{
			var channel = "";
			if(i > 0)
				channel = i+1;
			mesh[ "coords" + channel ] = new Float32Array( uvs_container[i] );
		}

		//extra info
		mesh.bounding = LS.Formats.computeMeshBounding( mesh.vertices );
		if(groups.length > 1)
			mesh.info.groups = groups;
		return mesh;
	}
};

LS.Formats.registerParser( parserASE );

//***** BVH Parser *****************
var parserBVH = {
	extension: "bvh",
	type: "scene",
	resource: "SceneTree",
	format: 'text',
	dataType:'text',
	
	parse: function( text, options, filename )
	{
		var MODE_HIERARCHY = 1;
		var MODE_MOTION = 2;
		var MODE_MOTION_DATA = 3;

		var mode = 0;
		var root = null;
		var parent = null;
		var node = null;
		var stack = [];
		var inside_of = null;
		var channels = [];

		var num_frames = -1;
		var frame_time = -1;
		var duration = -1;
		var current_frame = 0;

		var translator = {
			"Xposition":"x","Yposition":"y","Zposition":"z","Xrotation":"xrotation","Yrotation":"yrotation","Zrotation":"zrotation"
		};

		var ignore = false;

		var lines = text.split("\n");
		var length = lines.length;
		for (var lineIndex = 0;  lineIndex < length; ++lineIndex)
		{
			var line = lines[lineIndex].trim();

			if (line[0] == "#")
				continue;
			if(line == "")
				continue;

			var tokens = line.split(" ");
			var cmd = tokens[0];

			if(!mode)
			{
				switch(cmd)
				{
					case "HIERARCHY":
						mode = MODE_HIERARCHY;
						break;
				}
			}
			else if(mode == MODE_HIERARCHY)
			{
				switch(cmd)
				{
					case "ROOT":
						root = node = { name: tokens[1] };
						break;
					case "JOINT":
						parent = node;
						stack.push(parent);
						node = { name: tokens[1], node_type: "JOINT" };
						if(!parent.children)
							parent.children = [];
						parent.children.push(node);
						break;
					case "End":
						ignore = true;
						break;
					case "{":
						break;
					case "}":
						if(ignore)
							ignore = false; //ignoreEND
						else
						{
							node = stack.pop();
							if(!node)
								node = root;
							inside_of = node;
						}
						break;
					case "CHANNELS":
						for(var j = 2; j < tokens.length; ++j)
						{
							var property = tokens[j];
							if(translator[property])
								property = translator[property];
							channels.push( { name: tokens[j], property: node.name + "/" + property, type: "number", value_size: 1, data: [], packed_data: true } );
						}
						break;
					case "OFFSET":
						node.transform = { position: readFloats(tokens,1) };
						break;
					case "MOTION":
						mode = MODE_MOTION;
						break;
				}
			}//mode hierarchy
			else if(mode == MODE_MOTION)
			{
				if(tokens[0] == "Frames:")
					num_frames = parseInt( tokens[1] );
				else if(tokens[0] == "Frame" && tokens[1] == "Time:")
					frame_time = parseFloat( tokens[2] );

				if(num_frames != -1 && frame_time != -1)
				{
					duration = num_frames * frame_time;
					mode = MODE_MOTION_DATA;
				}
			}
			else if(mode == MODE_MOTION_DATA)
			{
				var current_time = current_frame * frame_time;
				for(var j = 0; j < channels.length; ++j)
				{
					var channel = channels[j];
					channel.data.push( current_time, parseFloat( tokens[j] ) );
				}

				++current_frame;
			}
		}

		function readFloats(tokens, offset)
		{
			var r = tokens.slice(offset || 0);
			return r.map(parseFloat);
		}

		var tracks = channels;
		for(var i = 0; i < tracks.length; ++i)
		{
			var track = tracks[i];
			track.duration = duration;
		}
		var animation = { name: "#animation", object_type: "Animation", takes: { "default": { name: "default", tracks: tracks } } };
		root.animations = animation.name;
		var resources = {};
		resources[ animation["name"] ] = animation;
		var scene = { root: root, object_type: "SceneNode", resources: resources };

		console.log(scene);
		return scene;
	}
};

LS.Formats.registerParser( parserBVH );
//collada.js 
//This worker should offload the main thread from parsing big text files (DAE)

(function(global){

var isWorker = global.document === undefined;
var DEG2RAD = Math.PI * 2 / 360;

//global temporal variables
var temp_mat4 = null;
var temp_vec2 = null;
var temp_vec3 = null;
var temp_vec4 = null;
var temp_quat = null;

if( isWorker )
{
	global.console = {
		log: function(msg) { 
			var args = Array.prototype.slice.call(arguments, 0);
			self.postMessage({action:"log", params: args});
		},
		warn: function(msg) { 
			var args = Array.prototype.slice.call(arguments, 0);
			self.postMessage({action:"warn", params: args});
		},
		error: function(msg) { 
			var args = Array.prototype.slice.call(arguments, 0);
			self.postMessage({action:"error", params: args});
		}
	};

	global.alert = console.error;
}

//Collada parser
global.Collada = {

	libsPath: "./",
	workerPath: "./",
	no_flip: true,
	use_transferables: true, //for workers
	onerror: null,
	verbose: false,
	config: { forceParser:false },

	init: function (config)
	{
		config = config || {}
		for(var i in config)
			this[i] = config[i];
		this.config = config;

		if( isWorker )
		{
			try
			{
				importScripts( this.libsPath + "gl-matrix-min.js", this.libsPath + "tinyxml.js" );
			}
			catch (err)
			{
				Collada.throwException( Collada.LIBMISSING_ERROR );
			}
		}

		//init glMatrix
		temp_mat4 = mat4.create();
		temp_vec2 = vec3.create();
		temp_vec3 = vec3.create();
		temp_vec4 = vec3.create();
		temp_quat = quat.create();

		if( isWorker )
			console.log("Collada worker ready");
	},

	load: function(url, callback)
	{
		request(url, function(data)
		{
			if(!data)
				callback( null );
			else
				callback( Collada.parse( data ) );
		});
	},

	_xmlroot: null,
	_nodes_by_id: null,
	_transferables: null,
	_controllers_found: null,
	_geometries_found: null,

	safeString: function (str) { 
		if(!str)
			return "";

		if(this.convertID)
			return this.convertID(str);

		return str.replace(/ /g,"_"); 
	},

	LIBMISSING_ERROR: "Libraries loading error, when using workers remember to pass the URL to the tinyxml.js in the options.libsPath",
	NOXMLPARSER_ERROR: "TinyXML not found, when using workers remember to pass the URL to the tinyxml.js in the options.libsPath (Workers do not allow to access the native XML DOMParser)",
	throwException: function(msg)
	{
		if(isWorker)
			self.postMessage({action:"exception", msg: msg});
		else
			if(Collada.onerror)
				Collada.onerror(msg);
		throw(msg);
	},

	getFilename: function(filename)
	{
		var pos = filename.lastIndexOf("\\");
		if(pos != -1)
			filename = filename.substr(pos+1);
		//strip unix slashes
		pos = filename.lastIndexOf("/");
		if(pos != -1)
			filename = filename.substr(pos+1);
		return filename;
	},

	parse: function(data, options, filename)
	{
		options = options || {};
		filename = filename || "_dae_" + Date.now() + ".dae";

		//console.log("Parsing collada");
		var flip = false;

		var xmlparser = null;
		var root = null;
		this._transferables = [];
		
		if(this.verbose)
			console.log(" - XML parsing...");

		if(global["DOMParser"] && !this.config.forceParser )
		{
			xmlparser = new DOMParser();
			root = xmlparser.parseFromString(data,"text/xml");
			if(this.verbose)
				console.log(" - XML parsed");			
		}
		else //USING JS XML PARSER IMPLEMENTATION (much slower)
		{
			if(!global["DOMImplementation"] )
				return Collada.throwException( Collada.NOXMLPARSER_ERROR );
			//use tinyxmlparser
			try
			{
				xmlparser = new DOMImplementation();
			}
			catch (err)
			{
				return Collada.throwException( Collada.NOXMLPARSER_ERROR );
			}

			root = xmlparser.loadXML(data);
			if(this.verbose)
				console.log(" - XML parsed");

			//for every node...
			var by_ids = root._nodes_by_id = {};
			for(var i = 0, l = root.all.length; i < l; ++i)
			{
				var node = root.all[i];
				by_ids[ node.id ] = node;
				if(node.getAttribute("sid"))
					by_ids[ node.getAttribute("sid") ] = node;
			}

			if(!this.extra_functions)
			{
				this.extra_functions = true;
				//these methods are missing so here is a lousy implementation
				DOMDocument.prototype.querySelector = DOMElement.prototype.querySelector = function(selector)
				{
					var tags = selector.split(" ");
					var current_element = this;

					while(tags.length)
					{
						var current = tags.shift();
						var tokens = current.split("#");
						var tagname = tokens[0];
						var id = tokens[1];
						var elements = tagname ? current_element.getElementsByTagName(tagname) : current_element.childNodes;
						if(!id) //no id filter
						{
							if(tags.length == 0)
								return elements.item(0);
							current_element = elements.item(0);
							continue;
						}

						//has id? check for all to see if one matches the id
						for(var i = 0; i < elements.length; i++)
							if( elements.item(i).getAttribute("id") == id)
							{
								if(tags.length == 0)
									return elements.item(i);
								current_element = elements.item(i);
								break;
							}
					}
					return null;
				}

				DOMDocument.prototype.querySelectorAll = DOMElement.prototype.querySelectorAll = function( selector )
				{
					var tags = selector.split(" ");
					if(tags.length == 1)
						return this.getElementsByTagName( selector );

					var current_element = this;
					var result = [];

					inner(this, tags);

					function inner(root, tags )
					{
						if(!tags)
							return;

						var current = tags.shift();
						var elements = root.getElementsByTagName( current );
						if(tags.length == 0)
						{
							for(var i = 0; i < elements.length; i++)
								result.push( elements.item(i) );
							return;
						}

						for(var i = 0; i < elements.length; i++)
							inner( elements.item(i), tags.concat() );
					}

					var list = new DOMNodeList(this.documentElement);
					list._nodes = result;
					list.length = result.length;

					return list;
				}

				Object.defineProperty( DOMElement.prototype, "textContent", { 
					get: function() { 
						var nodes = this.getChildNodes();
						return nodes.item(0).toString(); 
					},
					set: function() {} 
				});
			}
		}
		this._xmlroot = root;
		var xmlcollada = root.querySelector("COLLADA");
		if(xmlcollada)
		{
			this._current_DAE_version = xmlcollada.getAttribute("version");
			console.log("DAE Version:" + this._current_DAE_version);
		}

		//var xmlvisual_scene = root.querySelector("visual_scene");
		var xmlvisual_scene = root.getElementsByTagName("visual_scene").item(0);
		if(!xmlvisual_scene)
			throw("visual_scene XML node not found in DAE");

		//hack to avoid problems with bones with spaces in names
		this._nodes_by_id = {}; //clear
		this._controllers_found = {};//we need to check what controllers had been found, in case we miss one at the end
		this._geometries_found = {};

		//Create a scene tree
		var scene = { 
			object_type:"SceneTree", 
			light: null,
			materials: {},
			meshes: {},
			resources: {}, //used to store animation tracks
			root:{ children:[] },
			external_files: {} //store info about external files mentioned in this 
		};

		//scene metadata (like author, tool, up vector, dates, etc)
		var xmlasset = root.getElementsByTagName("asset")[0];
		if(xmlasset)
			scene.metadata = this.readAsset( xmlasset );

		//parse nodes tree to extract names and ierarchy only
		var xmlnodes = xmlvisual_scene.childNodes;
		for(var i = 0; i < xmlnodes.length; i++)
		{
			if(xmlnodes.item(i).localName != "node")
				continue;

			var node = this.readNodeTree( xmlnodes.item(i), scene, 0, flip );
			if(node)
				scene.root.children.push(node);
		}

		//parse nodes content (two steps so we have first all the scene tree info)
		for(var i = 0; i < xmlnodes.length; i++)
		{
			if(xmlnodes.item(i).localName != "node")
				continue;
			this.readNodeInfo( xmlnodes.item(i), scene, 0, flip );
		}

		//read remaining controllers (in some cases some controllers are not linked from the nodes or the geometries)
		this.readLibraryControllers( scene );

		//read animations
		var animations = this.readAnimations(root, scene);
		if(animations)
		{
			var animations_name = "#animations_" + filename.substr(0,filename.indexOf("."));
			scene.resources[ animations_name ] = animations;
			scene.root.animations = animations_name;
		}

		//read external files (images)
		scene.images = this.readImages(root);

		//clear memory
		this._nodes_by_id = {};
		this._controllers_found = {};
		this._geometries_found = {};
		this._xmlroot = null;

		//console.log(scene);
		return scene;
	},

	/* Collect node ids, in case there is bones (with spaces in name) I need to know the nodenames in advance */
	/*
	readAllNodeNames: function(xmlnode)
	{
		var node_id = this.safeString( xmlnode.getAttribute("id") );
		if(node_id)
			this._nodes_by_id[node_id] = true; //node found
		//nodes seem to have to possible ids, id and sid, I guess one is unique, the other user-defined
		var node_sid = this.safeString( xmlnode.getAttribute("sid") );
		if(node_sid)
			this._nodes_by_id[node_sid] = true; //node found


		for( var i = 0; i < xmlnode.childNodes.length; i++ )
		{
			var xmlchild = xmlnode.childNodes.item(i);

			//children
			if(xmlchild.localName != "node")
				continue;
			this.readAllNodeNames(xmlchild);
		}
	},
		*/

	readAsset: function( xmlasset )
	{
		var metadata = {};

		for( var i = 0; i < xmlasset.childNodes.length; i++ )
		{
			var xmlchild = xmlasset.childNodes.item(i);
			if(xmlchild.nodeType != 1 ) //not tag
				continue;
			switch( xmlchild.localName )
			{
				case "contributor": 
					var tool = xmlchild.querySelector("authoring_tool");
					if(tool)
						metadata["authoring_tool"] = tool.textContext;
					break;
				case "unit": metadata["unit"] = xmlchild.getAttribute("name"); break;
				default:
					metadata[ xmlchild.localName ] = xmlchild.textContent; break;
			}
		}

		return metadata;
	},

	readNodeTree: function(xmlnode, scene, level, flip)
	{
		var node_id = this.safeString( xmlnode.getAttribute("id") );
		var node_sid = this.safeString( xmlnode.getAttribute("sid") );

		if(!node_id && !node_sid)
			return null;

		//here we create the node
		var node = { 
			id: node_sid || node_id, 
			children:[], 
			_depth: level 
		};

		var node_type = xmlnode.getAttribute("type");
		if(node_type)
			node.type = node_type;

		var node_name = xmlnode.getAttribute("name");
		if( node_name)
			node.name = node_name;
		this._nodes_by_id[ node.id ] = node;
		if( node_sid )
			this._nodes_by_id[ node_sid ] = node;

		//transform
		node.model = this.readTransform(xmlnode, level, flip );

		//node elements
		for( var i = 0; i < xmlnode.childNodes.length; i++ )
		{
			var xmlchild = xmlnode.childNodes.item(i);
			if(xmlchild.nodeType != 1 ) //not tag
				continue;

			//children
			if(xmlchild.localName == "node")
			{
				var child_node = this.readNodeTree(xmlchild, scene, level+1, flip);
				if(child_node)
					node.children.push( child_node );
				continue;
			}
		}

		return node;
	},

	readNodeInfo: function(xmlnode, scene, level, flip)
	{
		var node_id = this.safeString( xmlnode.getAttribute("id") );
		var node_sid = this.safeString( xmlnode.getAttribute("sid") );

		if(!node_id && !node_sid)
			return null;

		var node = this._nodes_by_id[ node_id || node_sid ];

		//node elements
		for( var i = 0; i < xmlnode.childNodes.length; i++ )
		{
			var xmlchild = xmlnode.childNodes.item(i);
			if(xmlchild.nodeType != 1 ) //not tag
				continue;

			//children
			if(xmlchild.localName == "node")
			{
				this.readNodeInfo( xmlchild, scene, level+1, flip );
				continue;
			}

			//geometry
			if(xmlchild.localName == "instance_geometry")
			{
				var url = xmlchild.getAttribute("url");
				var mesh_id = url.toString().substr(1);
				node.mesh = mesh_id;

				if(!scene.meshes[ url ])
				{
					var mesh_data = this.readGeometry(url, flip);
					if(mesh_data)
					{
						mesh_data.name = mesh_id;
						scene.meshes[ mesh_id ] = mesh_data;
					}
				}

				//binded material
				var xmlmaterials = xmlchild.querySelectorAll("instance_material");
				if(xmlmaterials)
				{
					for(var iMat = 0; iMat < xmlmaterials.length; ++iMat)
					{
						var xmlmaterial = xmlmaterials.item(iMat);
						if(!xmlmaterial)
						{
							console.warn("instance_material not found: " + i);
							continue;
						}

						var matname = xmlmaterial.getAttribute("target").toString().substr(1);
						//matname = matname.replace(/ /g,"_"); //names cannot have spaces
						if(!scene.materials[ matname ])
						{
							var material = this.readMaterial(matname);
							if(material)
							{
								material.id = matname; 
								scene.materials[ material.id ] = material;
							}
						}
						if(iMat == 0)
							node.material = matname;
						else
						{
							if(!node.materials)
								node.materials = [];
							node.materials.push(matname);
						}
					}
				}
			}


			//this node has a controller: skinning, morph targets or even multimaterial are controllers
			//warning: I detected that some nodes could have a controller but they are not referenced here.  ??
			if(xmlchild.localName == "instance_controller")
			{
				var url = xmlchild.getAttribute("url");
				var xmlcontroller = this._xmlroot.querySelector("controller" + url);

				if(xmlcontroller)
				{
					var mesh_data = this.readController( xmlcontroller, flip, scene );

					//binded materials
					var xmlbindmaterial = xmlchild.querySelector("bind_material");
					if(xmlbindmaterial)
						node.materials = this.readBindMaterials( xmlbindmaterial );

					if(mesh_data)
					{
						var mesh = mesh_data;
						if( mesh_data.type == "morph" )
						{
							mesh = mesh_data.mesh;
							node.morph_targets = mesh_data.morph_targets;
						}

						mesh.name = url.toString();
						node.mesh = url.toString();
						scene.meshes[ url ] = mesh;
					}
				}
			}

			//light
			if(xmlchild.localName == "instance_light")
			{
				var url = xmlchild.getAttribute("url");
				this.readLight(node, url);
			}

			//camera
			if(xmlchild.localName == "instance_camera")
			{
				var url = xmlchild.getAttribute("url");
				this.readCamera(node, url);
			}

			//other possible tags?
		}
	},

	//if you want to rename some material names
	material_translate_table: {
		/*
		transparency: "opacity",
		reflectivity: "reflection_factor",
		specular: "specular_factor",
		shininess: "specular_gloss",
		emission: "emissive",
		diffuse: "color"
		*/
	},

	light_translate_table: {
		point: "omni"		
	},

	camera_translate_table: {
		xfov: "fov",
		aspect_ratio: "aspect",
		znear: "near",
		zfar: "far"
	},

	//used when id have spaces (regular selector do not support spaces)
	querySelectorAndId: function(root, selector, id)
	{
		var nodes = root.querySelectorAll(selector);
		for(var i = 0; i < nodes.length; i++)
		{
			var attr_id = nodes.item(i).getAttribute("id");
			if( !attr_id ) 
				continue;
			attr_id = attr_id.toString();
			if(attr_id == id )
				return nodes.item(i);
		}
		return null;
	},

	//returns the first element that matches a tag name, if not tagname is specified then the first tag element
	getFirstChildElement: function(root, localName)
	{
		var c = root.childNodes;
		for(var i = 0; i < c.length; ++i)
		{
			var item = c.item(i);
			if( (item.localName && !localName) || (localName && localName == item.localName) )
				return item;
		}
		return null;
	},

	readMaterial: function(url)
	{
		var xmlmaterial = this.querySelectorAndId( this._xmlroot, "library_materials material", url );
		if(!xmlmaterial)
			return null;

		//get effect name
		var xmleffect = xmlmaterial.querySelector("instance_effect");
		if(!xmleffect) return null;

		var effect_url = xmleffect.getAttribute("url").substr(1);

		//get effect
		var xmleffects = this.querySelectorAndId( this._xmlroot, "library_effects effect", effect_url );
		if(!xmleffects) return null;

		//get common
		var xmltechnique = xmleffects.querySelector("technique");
		if(!xmltechnique) 
			return null;

		var material = {};

		var xmlphong = xmltechnique.querySelector("phong");
		if(!xmlphong) 
			xmlphong = xmltechnique.querySelector("blinn");
		if(!xmlphong) 
			return null;

		//for every tag of properties
		for(var i = 0; i < xmlphong.childNodes.length; ++i)
		{
			var xmlparam = xmlphong.childNodes.item(i);

			if(!xmlparam.localName) //text tag
				continue;

			//translate name
			var param_name = xmlparam.localName.toString();
			if(this.material_translate_table[param_name])
				param_name = this.material_translate_table[param_name];

			//value
			var xmlparam_value = this.getFirstChildElement( xmlparam );
			if(!xmlparam_value)
				continue;

			if(xmlparam_value.localName.toString() == "color")
			{
				var value = this.readContentAsFloats( xmlparam_value );
				if( xmlparam.getAttribute("opaque") == "RGB_ZERO")
					material[ param_name ] = value.subarray(0,4);
				else
					material[ param_name ] = value.subarray(0,3);
				continue;
			}
			else if(xmlparam_value.localName.toString() == "float")
			{
				material[ param_name ] = this.readContentAsFloats( xmlparam_value )[0];
				continue;
			}
			else if(xmlparam_value.localName.toString() == "texture")
			{
				if(!material.textures)
					material.textures = {};
				var map_id = xmlparam_value.getAttribute("texture");
				if(!map_id)
					continue;

				var map_info = { map_id: map_id };
				var uvs = xmlparam_value.getAttribute("texcoord");
				map_info.uvs = uvs;
				material.textures[ param_name ] = map_info;
			}
		}

		material.object_type = "Material";
		return material;
	},

	readLight: function(node, url)
	{
		var light = {};

		var xmlnode = null;
		
		if(url.length > 1) //weird cases with id == #
			xmlnode = this._xmlroot.querySelector("library_lights " + url);
		else
		{
			var xmlliblights = this._xmlroot.querySelector("library_lights");
			xmlnode = this.getFirstChildElement( xmlliblights, "light" );
		}

		if(!xmlnode)
			return null;

		//pack
		var children = [];
		var xml = xmlnode.querySelector("technique_common");
		if(xml)
			for(var i = 0; i < xml.childNodes.length; i++ )
				if( xml.childNodes.item(i).nodeType == 1 ) //tag
					children.push( xml.childNodes.item(i) );

		var xmls = xmlnode.querySelectorAll("technique");
		for(var i = 0; i < xmls.length; i++)
		{
			var xml2 = xmls.item(i);
			for(var j = 0; j < xml2.childNodes.length; j++ )
				if( xml2.childNodes.item(j).nodeType == 1 ) //tag
					children.push( xml2.childNodes.item(j) );
		}

		//get
		for(var i = 0; i < children.length; i++)
		{
			var xml = children[i];
			switch( xml.localName )
			{
				case "point": 
				case "spot": 
					light.type = this.light_translate_table[ xml.localName ]; 
					parse_params(light, xml);
					break;
				case "intensity": light.intensity = this.readContentAsFloats( xml )[0]; 
					break;
			}
		}

		function parse_params(light, xml)
		{
			for(var i = 0; i < xml.childNodes.length; i++)
			{
				var child = xml.childNodes.item(i);
				if( !child || child.nodeType != 1 ) //tag
					continue;

				switch( child.localName )
				{
					case "color": light.color = Collada.readContentAsFloats( child ); break;
					case "falloff_angle": 
						light.angle_end = Collada.readContentAsFloats( child )[0]; 
						light.angle = light.angle_end - 10; 
					break;
				}
			}
		}

		/*
		if(node.model)
		{
			var M = mat4.create();
			var R = mat4.rotate(M,M, Math.PI * 0.5, [1,0,0]);
			//mat4.multiply( node.model, node.model, R );
		}
		*/
		light.position = [0,0,0];
		light.target = [0,-1,0];

		node.light = light;
	},

	readCamera: function(node, url)
	{
		var camera = {};

		var xmlnode = this._xmlroot.querySelector("library_cameras " + url);
		if(!xmlnode) return null;

		//pack
		var children = [];
		var xml = xmlnode.querySelector("technique_common");
		if(xml) //grab all internal stuff
			for(var i = 0; i < xml.childNodes.length; i++ )
				if( xml.childNodes.item(i).nodeType == 1 ) //tag
					children.push( xml.childNodes.item(i) );

		//
		for(var i = 0; i < children.length; i++)
		{
			var tag = children[i];
			parse_params(camera, tag);
		}

		function parse_params(camera, xml)
		{
			for(var i = 0; i < xml.childNodes.length; i++)
			{
				var child = xml.childNodes.item(i);
				if( !child || child.nodeType != 1 ) //tag
					continue;
				var translated = Collada.camera_translate_table[ child.localName ] || child.localName;
				camera[ translated ] = parseFloat( child.textContent );
			}
		}

		node.camera = camera;
	},

	readTransform: function(xmlnode, level, flip)
	{
		//identity
		var matrix = mat4.create(); 
		var temp = mat4.create(); 
		var tmpq = quat.create();
		
		var flip_fix = false;

		//search for the matrix
		for(var i = 0; i < xmlnode.childNodes.length; i++)
		{
			var xml = xmlnode.childNodes.item(i);
			if( !xml || xml.nodeType != 1 ) //tag
				continue;

			if(xml.localName == "matrix")
			{
				var matrix = this.readContentAsFloats(xml);
				//console.log("Nodename: " + xmlnode.getAttribute("id"));
				//console.log(matrix);
				this.transformMatrix(matrix, level == 0);
				//console.log(matrix);
				return matrix;
			}

			if(xml.localName == "translate")
			{
				var values = this.readContentAsFloats(xml);
				if(flip && level > 0)
				{
					var tmp = values[1];
					values[1] = values[2];
					values[2] = -tmp; //swap coords
				}

				mat4.translate( matrix, matrix, values );
				continue;
			}

			//rotate
			if(xml.localName == "rotate")
			{
				var values = this.readContentAsFloats(xml);
				if(values.length == 4) //x,y,z, angle
				{
					var id = xml.getAttribute("sid");
					if(id == "jointOrientX")
					{
						values[3] += 90;
						flip_fix = true;
					}
					//rotateX & rotateY & rotateZ done below

					if(flip)
					{
						var tmp = values[1];
						values[1] = values[2];
						values[2] = -tmp; //swap coords
					}

					if(values[3] != 0.0)
					{
						quat.setAxisAngle( tmpq, values.subarray(0,3), values[3] * DEG2RAD);
						mat4.fromQuat( temp, tmpq );
						mat4.multiply(matrix, matrix, temp);
					}
				}
				continue;
			}

			//scale
			if(xml.localName == "scale")
			{
				var values = this.readContentAsFloats(xml);
				if(flip)
				{
					var tmp = values[1];
					values[1] = values[2];
					values[2] = -tmp; //swap coords
				}
				mat4.scale( matrix, matrix, values );
			}
		}

		return matrix;
	},

	readTransform2: function(xmlnode, level, flip)
	{
		//identity
		var matrix = mat4.create(); 
		var rotation = quat.create();
		var tmpmatrix = mat4.create();
		var tmpq = quat.create();
		var translate = vec3.create();
		var scale = vec3.fromValues(1,1,1);
		
		var flip_fix = false;

		//search for the matrix
		for(var i = 0; i < xmlnode.childNodes.length; i++)
		{
			var xml = xmlnode.childNodes.item(i);

			if(xml.localName == "matrix")
			{
				var matrix = this.readContentAsFloats(xml);
				//console.log("Nodename: " + xmlnode.getAttribute("id"));
				//console.log(matrix);
				this.transformMatrix(matrix, level == 0);
				//console.log(matrix);
				return matrix;
			}

			if(xml.localName == "translate")
			{
				var values = this.readContentAsFloats(xml);
				translate.set(values);
				continue;
			}

			//rotate
			if(xml.localName == "rotate")
			{
				var values = this.readContentAsFloats(xml);
				if(values.length == 4) //x,y,z, angle
				{
					var id = xml.getAttribute("sid");
					if(id == "jointOrientX")
					{
						values[3] += 90;
						flip_fix = true;
					}
					//rotateX & rotateY & rotateZ done below

					if(flip)
					{
						var tmp = values[1];
						values[1] = values[2];
						values[2] = -tmp; //swap coords
					}

					if(values[3] != 0.0)
					{
						quat.setAxisAngle( tmpq, values.subarray(0,3), values[3] * DEG2RAD);
						quat.multiply(rotation,rotation,tmpq);
					}
				}
				continue;
			}

			//scale
			if(xml.localName == "scale")
			{
				var values = this.readContentAsFloats(xml);
				if(flip)
				{
					var tmp = values[1];
					values[1] = values[2];
					values[2] = -tmp; //swap coords
				}
				scale.set(values);
			}
		}

		if(flip && level > 0)
		{
			var tmp = translate[1];
			translate[1] = translate[2];
			translate[2] = -tmp; //swap coords
		}
		mat4.translate(matrix, matrix, translate);

		mat4.fromQuat( tmpmatrix , rotation );
		//mat4.rotateX(tmpmatrix, tmpmatrix, Math.PI * 0.5);
		mat4.multiply( matrix, matrix, tmpmatrix );
		mat4.scale( matrix, matrix, scale );


		return matrix;
	},

	//for help read this: https://www.khronos.org/collada/wiki/Using_accessors
	readGeometry: function(id, flip, scene)
	{
		//already read, could happend if several controllers point to the same mesh
		if( this._geometries_found[ id ] !== undefined )
			return this._geometries_found[ id ];

		//var xmlgeometry = this._xmlroot.querySelector("geometry" + id);
		var xmlgeometry = this._xmlroot.getElementById(id.substr(1));
		if(!xmlgeometry) 
		{
			console.warn("readGeometry: geometry not found: " + id);
			this._geometries_found[ id ] = null;
			return null;
		}

		//if the geometry has morph targets then instead of storing it in a geometry, it is in a controller
		if(xmlgeometry.localName == "controller") 
		{
			var geometry = this.readController( xmlgeometry, flip, scene );
			this._geometries_found[ id ] = geometry;
			return geometry;
		}


		if(xmlgeometry.localName != "geometry") 
		{
			console.warn("readGeometry: tag should be geometry, instead it was found: " + xmlgeometry.localName);
			this._geometries_found[ id ] = null;
			return null;
		}

		var xmlmesh = xmlgeometry.querySelector("mesh");
		if(!xmlmesh)
		{
			console.warn("readGeometry: mesh not found in geometry: " + id);
			this._geometries_found[ id ] = null;
			return null;
		}
		
		//get data sources
		var sources = {};
		var xmlsources = xmlmesh.querySelectorAll("source");
		for(var i = 0; i < xmlsources.length; i++)
		{
			var xmlsource = xmlsources.item(i);
			if(!xmlsource.querySelector) continue;
			var float_array = xmlsource.querySelector("float_array");
			if(!float_array)
				continue;
			var floats = this.readContentAsFloats( float_array );

			var xmlaccessor = xmlsource.querySelector("accessor");
			var stride = parseInt( xmlaccessor.getAttribute("stride") );

			sources[ xmlsource.getAttribute("id") ] = {stride: stride, data: floats};
		}

		//get streams
		var xmlvertices = xmlmesh.querySelector("vertices input");
		var vertices_source = sources[ xmlvertices.getAttribute("source").substr(1) ];
		sources[ xmlmesh.querySelector("vertices").getAttribute("id") ] = vertices_source;

		var mesh = null;
		var xmlpolygons = xmlmesh.querySelector("polygons");
		if( xmlpolygons )
			mesh = this.readTriangles( xmlpolygons, sources );

		if(!mesh)
		{
			var xmltriangles = xmlmesh.querySelectorAll("triangles");
			if(xmltriangles && xmltriangles.length)
				mesh = this.readTriangles( xmltriangles, sources );
		}

		if(!mesh)
		{
			//polylist = true;
			//var vcount = null;
			//var xmlvcount = xmlpolygons.querySelector("vcount");
			//var vcount = this.readContentAsUInt32( xmlvcount );
			var xmlpolylist = xmlmesh.querySelector("polylist");
			if(xmlpolylist)
				mesh = this.readPolylist( xmlpolylist, sources );
		}


		if(!mesh)
		{
			var xmllinestrip = xmlmesh.querySelector("linestrips");
			if(xmllinestrip)
				mesh = this.readLineStrip( sources, xmllinestrip );
		}

		if(!mesh)
		{
			console.log("no polygons or triangles in mesh: " + id);
			this._geometries_found[ id ] = null;
			return null;
		}
	
		//swap coords (X,Y,Z) -> (X,Z,-Y)
		if(flip && !this.no_flip)
		{
			var tmp = 0;
			var array = mesh.vertices;
			for(var i = 0, l = array.length; i < l; i += 3)
			{
				tmp = array[i+1]; 
				array[i+1] = array[i+2];
				array[i+2] = -tmp; 
			}

			array = mesh.normals;
			for(var i = 0, l = array.length; i < l; i += 3)
			{
				tmp = array[i+1]; 
				array[i+1] = array[i+2];
				array[i+2] = -tmp; 
			}
		}

		//transferables for worker
		if(isWorker && this.use_transferables)
		{
			for(var i in mesh)
			{
				var data = mesh[i];
				if(data && data.buffer && data.length > 100)
				{
					this._transferables.push(data.buffer);
				}
			}
		}

		//extra info
		mesh.filename = id;
		mesh.object_type = "Mesh";

		this._geometries_found[ id ] = mesh;
		return mesh;
	},

	readTriangles: function( xmltriangles, sources )
	{
		var use_indices = false;

		var groups = [];
		var buffers = [];
		var last_index = 0;
		var facemap = {};
		var vertex_remap = []; //maps DAE vertex index to Mesh vertex index (because when meshes are triangulated indices are changed
		var indicesArray = [];
		var last_start = 0;
		var group_name = "";
		var material_name = "";

		//for every triangles set (warning, some times they are repeated...)
		for(var tris = 0; tris < xmltriangles.length; tris++)
		{
			var xml_shape_root = xmltriangles.item(tris);
			var triangles = xml_shape_root.localName == "triangles";

			material_name = xml_shape_root.getAttribute("material");

			//for each buffer (input) build the structure info
			if(tris == 0)
				buffers = this.readShapeInputs( xml_shape_root, sources );

			//assuming buffers are ordered by offset

			//iterate data
			var xmlps = xml_shape_root.querySelectorAll("p");
			var num_data_vertex = buffers.length; //one value per input buffer

			//for every polygon (could be one with all the indices, could be several, depends on the program)
			for(var i = 0; i < xmlps.length; i++)
			{
				var xmlp = xmlps.item(i);
				if(!xmlp || !xmlp.textContent) 
					break;

				var data = xmlp.textContent.trim().split(" ");

				//used for triangulate polys
				var first_index = -1;
				var current_index = -1;
				var prev_index = -1;

				//discomment to force 16bits indices
				//if(use_indices && last_index >= 256*256)
				//	break;

				var num_values_per_vertex = 1;
				for(var b in buffers)
					num_values_per_vertex = Math.max( num_values_per_vertex, buffers[b][4] + 1);

				//for every pack of indices in the polygon (vertex, normal, uv, ... )
				var current_data_pos = 0;
				for(var k = 0, l = data.length; k < l; k += num_values_per_vertex)
				{
					var vertex_id = data.slice(k,k+num_values_per_vertex).join(" "); //generate unique id

					prev_index = current_index;
					if(facemap.hasOwnProperty(vertex_id)) //add to arrays, keep the index
						current_index = facemap[vertex_id];
					else
					{
						//for every data buffer associated to this vertex
						for(var j = 0; j < buffers.length; ++j)
						{
							var buffer = buffers[j];
							var array = buffer[1]; //array where we accumulate the final data as we extract if from sources
							var source = buffer[3]; //where to read the data from
							
							//compute the index inside the data source array
							//var index = parseInt(data[k + j]);
							var index = parseInt( data[ k + buffer[4] ] );
							//current_data_pos += buffer[4];

							//remember this index in case we need to remap
							if(j == 0)
								vertex_remap[ array.length / buffer[2] ] = index; //not sure if buffer[2], it should be number of floats per vertex (usually 3)
								//vertex_remap[ array.length / num_data_vertex ] = index;

							//compute the position inside the source buffer where the final data is located
							index *= buffer[2]; //this works in most DAEs (not all)
							//index = index * buffer[2] + buffer[4]; //stride(2) offset(4)
							//index += buffer[4]; //stride(2) offset(4)
							//extract every value of this element and store it in its final array (every x,y,z, etc)
							for(var x = 0; x < buffer[2]; ++x)
							{
								if(source[index+x] === undefined) throw("UNDEFINED!"); //DEBUG
								array.push( source[index+x] );
							}
						}
						
						current_index = last_index;
						last_index += 1;
						facemap[vertex_id] = current_index;
					}

					if(!triangles) //the xml element is not triangles? then split polygons in triangles
					{
						if(k == 0)
							first_index = current_index;
						//if(k > 2 * num_data_vertex) //not sure if use this or the next line, the next one works in some DAEs but not sure if it works in all
						if(k > 2) //triangulate polygons: ensure this works
						{
							indicesArray.push( first_index );
							indicesArray.push( prev_index );
						}
					}

					indicesArray.push( current_index );
				}//per vertex
			}//per polygon

			var group = {
				name: group_name || ("group" + tris),
				start: last_start,
				length: indicesArray.length - last_start,
				material: material_name || ""
			};
			last_start = indicesArray.length;
			groups.push( group );
		}//per triangles group

		var mesh = {
			vertices: new Float32Array( buffers[0][1] ),
			info: { groups: groups },
			_remap: new Uint32Array(vertex_remap)
		};

		this.transformMeshInfo( mesh, buffers, indicesArray );

		return mesh;
	},

	readPolylist: function( xml_shape_root, sources )
	{
		var use_indices = false;

		var groups = [];
		var buffers = [];
		var last_index = 0;
		var facemap = {};
		var vertex_remap = [];
		var indicesArray = [];
		var last_start = 0;
		var group_name = "";
		var material_name = "";

		material_name = xml_shape_root.getAttribute("material");
		buffers = this.readShapeInputs( xml_shape_root, sources );

		var xmlvcount = xml_shape_root.querySelector("vcount");
		var vcount = this.readContentAsUInt32( xmlvcount );

		var xmlp = xml_shape_root.querySelector("p");
		var data = this.readContentAsUInt32( xmlp );

		var num_data_vertex = buffers.length;

		var pos = 0;
		for(var i = 0, l = vcount.length; i < l; ++i)
		{
			var num_vertices = vcount[i];

			var first_index = -1;
			var current_index = -1;
			var prev_index = -1;

			//iterate vertices of this polygon
			for(var k = 0; k < num_vertices; ++k )
			{
				var vertex_id = data.subarray(pos,pos + num_data_vertex).join(" ");

				prev_index = current_index;
				if(facemap.hasOwnProperty(vertex_id)) //add to arrays, keep the index
					current_index = facemap[vertex_id];
				else
				{
					for(var j = 0; j < buffers.length; ++j)
					{
						var buffer = buffers[j];
						var index = parseInt( data[pos + j] ); //p
						var array = buffer[1]; //array with all the data
						var source = buffer[3]; //where to read the data from
						if(j == 0)
							vertex_remap[ array.length / num_data_vertex ] = index;
						index *= buffer[2]; //stride
						for(var x = 0; x < buffer[2]; ++x)
							array.push( source[index+x] );
					}
					
					current_index = last_index;
					last_index += 1;
					facemap[vertex_id] = current_index;
				}

				if(num_vertices > 3) //split polygons then
				{
					if(k == 0)
						first_index = current_index;
					//if(k > 2 * num_data_vertex) //not sure if use this or the next line, the next one works in some DAEs but not sure if it works in all
					if(k > 2) //triangulate polygons: tested, this works
					{
						indicesArray.push( first_index );
						indicesArray.push( prev_index );
					}
				}

				indicesArray.push( current_index );
				pos += num_data_vertex;
			}//per vertex

		}//per polygon

		var mesh = {
			vertices: new Float32Array( buffers[0][1] ),
			info: {},
			_remap: new Uint32Array( vertex_remap )
		};

		this.transformMeshInfo( mesh, buffers, indicesArray );

		return mesh;
	},

	readShapeInputs: function(xml_shape_root, sources)
	{
		var buffers = [];

		var xmlinputs = xml_shape_root.querySelectorAll("input");
		for(var i = 0; i < xmlinputs.length; i++)
		{
			var xmlinput = xmlinputs.item(i);
			if(!xmlinput.getAttribute) 
				continue;
			var semantic = xmlinput.getAttribute("semantic").toUpperCase();
			var stream_source = sources[ xmlinput.getAttribute("source").substr(1) ];
			var offset = parseInt( xmlinput.getAttribute("offset") );
			var data_set = 0;
			if(xmlinput.getAttribute("set"))
				data_set = parseInt( xmlinput.getAttribute("set") );
			buffers.push([semantic, [], stream_source.stride, stream_source.data, offset, data_set ]);
		}

		return buffers;
	},

	transformMeshInfo: function( mesh, buffers, indicesArray )
	{
		//rename buffers (DAE has other names)
		var translator = {
			"normal":"normals",
			"texcoord":"coords"
		};
		for(var i = 1; i < buffers.length; ++i)
		{
			var name = buffers[i][0].toLowerCase();
			var data = buffers[i][1];
			if(!data.length)
				continue;

			if(translator[name])
				name = translator[name];
			if(mesh[name])
				name = name + buffers[i][5];
			mesh[ name ] = new Float32Array(data); //are they always float32? I think so
		}
		
		if(indicesArray && indicesArray.length)
		{
			if(mesh.vertices.length > 256*256)
				mesh.triangles = new Uint32Array(indicesArray);
			else
				mesh.triangles = new Uint16Array(indicesArray);
		}

		return mesh;
	},

	readLineStrip: function(sources, xmllinestrip)
	{
		var use_indices = false;

		var buffers = [];
		var last_index = 0;
		var facemap = {};
		var vertex_remap = [];
		var indicesArray = [];
		var last_start = 0;
		var group_name = "";
		var material_name = "";

		var tris = 0; //used in case there are several strips

		//for each buffer (input) build the structure info
		var xmlinputs = xmllinestrip.querySelectorAll("input");
		if(tris == 0) //first iteration, create buffers
			for(var i = 0; i < xmlinputs.length; i++)
			{
				var xmlinput = xmlinputs.item(i);
				if(!xmlinput.getAttribute) 
					continue;
				var semantic = xmlinput.getAttribute("semantic").toUpperCase();
				var stream_source = sources[ xmlinput.getAttribute("source").substr(1) ];
				var offset = parseInt( xmlinput.getAttribute("offset") );
				var data_set = 0;
				if(xmlinput.getAttribute("set"))
					data_set = parseInt( xmlinput.getAttribute("set") );

				buffers.push([semantic, [], stream_source.stride, stream_source.data, offset, data_set]);
			}
		//assuming buffers are ordered by offset

		//iterate data
		var xmlps = xmllinestrip.querySelectorAll("p");
		var num_data_vertex = buffers.length; //one value per input buffer

		//for every polygon (could be one with all the indices, could be several, depends on the program)
		for(var i = 0; i < xmlps.length; i++)
		{
			var xmlp = xmlps.item(i);
			if(!xmlp || !xmlp.textContent) 
				break;

			var data = xmlp.textContent.trim().split(" ");

			//used for triangulate polys
			var first_index = -1;
			var current_index = -1;
			var prev_index = -1;

			//if(use_indices && last_index >= 256*256)
			//	break;

			//for every pack of indices in the polygon (vertex, normal, uv, ... )
			for(var k = 0, l = data.length; k < l; k += num_data_vertex)
			{
				var vertex_id = data.slice(k,k+num_data_vertex).join(" "); //generate unique id

				prev_index = current_index;
				if(facemap.hasOwnProperty(vertex_id)) //add to arrays, keep the index
					current_index = facemap[vertex_id];
				else
				{
					for(var j = 0; j < buffers.length; ++j)
					{
						var buffer = buffers[j];
						var index = parseInt(data[k + j]);
						var array = buffer[1]; //array with all the data
						var source = buffer[3]; //where to read the data from
						if(j == 0)
							vertex_remap[ array.length / num_data_vertex ] = index;
						index *= buffer[2]; //stride
						for(var x = 0; x < buffer[2]; ++x)
							array.push( source[index+x] );
					}
					
					current_index = last_index;
					last_index += 1;
					facemap[vertex_id] = current_index;
				}

				indicesArray.push( current_index );
			}//per vertex
		}//per polygon

		var mesh = {
			primitive: "line_strip",
			vertices: new Float32Array( buffers[0][1] ),
			info: {}
		};

		return this.transformMeshInfo( mesh, buffers, indicesArray );
	},

	//like querySelector but allows spaces in names because COLLADA allows space in names
	findXMLNodeById: function(root, nodename, id)
	{
		//precomputed
		if( this._xmlroot._nodes_by_id )
		{
			var n = this._xmlroot._nodes_by_id[ id ];
			if( n && n.localName == nodename)
				return n;
		}
		else //for the native parser
		{
			var n = this._xmlroot.getElementById( id );
			if(n)
				return n;
		}

		//recursive: slow
		var childs = root.childNodes;
		for(var i = 0; i < childs.length; ++i)
		{
			var xmlnode = childs.item(i);
			if(xmlnode.nodeType != 1 ) //no tag
				continue;
			if(xmlnode.localName != nodename)
				continue;
			var node_id = xmlnode.getAttribute("id");
			if(node_id == id)
				return xmlnode;
		}
		return null;
	},

	readImages: function(root)
	{
		var xmlimages = root.querySelector("library_images");
		if(!xmlimages)
			return null;

		var images = {};

		var xmlimages_childs = xmlimages.childNodes;
		for(var i = 0; i < xmlimages_childs.length; ++i)
		{
			var xmlimage = xmlimages_childs.item(i);
			if(xmlimage.nodeType != 1 ) //no tag
				continue;

			var xmlinitfrom = xmlimage.querySelector("init_from");
			if(!xmlinitfrom)
				continue;
			if(xmlinitfrom.textContent)
			{
				var filename = this.getFilename( xmlinitfrom.textContent );
				var id = xmlimage.getAttribute("id");
				images[id] = { filename: filename, map: id, name: xmlimage.getAttribute("name"), path: xmlinitfrom.textContent };
			}
		}

		return images;
	},

	readAnimations: function(root, scene)
	{
		var xmlanimations = root.querySelector("library_animations");
		if(!xmlanimations) return null;

		var xmlanimation_childs = xmlanimations.childNodes;

		var animations = {
			object_type: "Animation",
			takes: {}
		};

		var default_take = { tracks: [] };
		var tracks = default_take.tracks;

		for(var i = 0; i < xmlanimation_childs.length; ++i)
		{
			var xmlanimation = xmlanimation_childs.item(i);
			if(xmlanimation.nodeType != 1 || xmlanimation.localName != "animation") //no tag
				continue;

			var anim_id = xmlanimation.getAttribute("id");
			if(!anim_id) //nested animation (DAE 1.5)
			{
				var xmlanimation2_childs = xmlanimation.querySelectorAll("animation");
				for(var j = 0; j < xmlanimation2_childs.length; ++j)
				{
					var xmlanimation2 = xmlanimation2_childs.item(j);
					var anim = this.readAnimationTrack( xmlanimation2 );
					tracks.push( anim );
				}
			}
			else //no nested (DAE 1.4)
			{
				var anim = this.readAnimationTrack( xmlanimation );
				if(anim)
					tracks.push( anim );
			}
		}

		if(!tracks.length) 
			return null; //empty animation

		//compute animation duration
		var max_time = 0;
		for(var i = 0; i < tracks.length; ++i)
			if( max_time < tracks[i].duration )
				max_time = anim.duration;

		default_take.name = "default";
		default_take.duration = max_time;
		animations.takes[ default_take.name ] = default_take;
		return animations;
	},

	readAnimationTrack: function( xmlanimation )
	{
		if(xmlanimation.localName != "animation")
			return null;

		var anim_id = xmlanimation.getAttribute("id");

		//channels are like animated properties
		var xmlchannel = xmlanimation.querySelector("channel");
		if(!xmlchannel) 
			return null;

		var source = xmlchannel.getAttribute("source");
		var target = xmlchannel.getAttribute("target");

		//sampler, is in charge of the interpolation
		//var xmlsampler = xmlanimation.querySelector("sampler" + source);
		var xmlsampler = this.findXMLNodeById( xmlanimation, "sampler", source.substr(1) );
		if(!xmlsampler)
		{
			console.error("Error DAE: Sampler not found in " + source);
			return null;
		}

		var inputs = {};
		var sources = {};
		var params = {};
		var xmlinputs = xmlsampler.querySelectorAll("input");

		var time_data = null;

		//iterate inputs: collada separates the keyframe info in independent streams, like time, interpolation method, value )
		for(var j = 0; j < xmlinputs.length; j++)
		{
			var xmlinput = xmlinputs.item(j);
			var source_name =  xmlinput.getAttribute("source");

			//there are three 
			var semantic = xmlinput.getAttribute("semantic");

			//Search for source
			var xmlsource = this.findXMLNodeById( xmlanimation, "source", source_name.substr(1) );
			if(!xmlsource)
				continue;

			var xmlparam = xmlsource.querySelector("param");
			if(!xmlparam)
				continue;

			var type = xmlparam.getAttribute("type");
			inputs[ semantic ] = { source: source_name, type: type };

			var data_array = null;

			if(type == "float" || type == "float4x4")
			{
				var xmlfloatarray = xmlsource.querySelector("float_array");
				var floats = this.readContentAsFloats( xmlfloatarray );
				sources[ source_name ] = floats;
				data_array = floats;

			}
			else //only floats and matrices are supported in animation
				continue;

			var param_name = xmlparam.getAttribute("name");
			if(param_name == "TIME")
				time_data = data_array;
			params[ semantic == "OUTPUT" ? semantic : param_name ] = type;
		}

		if(!time_data)
		{
			console.error("Error DAE: no TIME info found in animation: " + anim_id);
			return null;
		}

		//construct animation
		var path = target.split("/");

		var anim = {};
		var nodename = path[0]; //safeString ?
		var locator = nodename + "/" + path[1];
		//anim.nodename = this.safeString( path[0] ); //where it goes
		anim.name = path[1];
		anim.property = locator;
		var node = this._nodes_by_id[ nodename ];
		var type = "number";
		var element_size = 1;
		var param_type = params["OUTPUT"];
		switch(param_type)
		{
			case "float": element_size = 1; break;
			case "float3x3": element_size = 9; type = "mat3"; break;
			case "float4x4": element_size = 16; type = "mat4"; break;
			default: break;
		}

		anim.type = type;
		anim.value_size = element_size;
		anim.duration = time_data[ time_data.length - 1]; //last sample

		var value_data = sources[ inputs["OUTPUT"].source ];
		if(!value_data)
			return null;

		//Pack data ****************
		var num_samples = time_data.length;
		var sample_size = element_size + 1;
		var anim_data = new Float32Array( num_samples * sample_size );
		//for every sample
		for(var j = 0; j < time_data.length; ++j)
		{
			anim_data[j * sample_size] = time_data[j]; //set time
			var value = value_data.subarray( j * element_size, (j+1) * element_size );
			if(param_type == "float4x4")
			{
				this.transformMatrix( value, node ? node._depth == 0 : 0 );
				//mat4.transpose(value, value);
			}
			anim_data.set(value, j * sample_size + 1); //set data
		}

		if(isWorker && this.use_transferables)
		{
			var data = anim_data;
			if(data && data.buffer && data.length > 100)
				this._transferables.push(data.buffer);
		}

		anim.data = anim_data;
		return anim;
	},

	findNode: function(root, id)
	{
		if(root.id == id) return root;
		if(root.children)
			for(var i in root.children)
			{
				var ret = this.findNode(root.children[i], id);
				if(ret) return ret;
			}
		return null;
	},

	readLibraryControllers: function( scene )
	{
		var xmllibrarycontrollers = this._xmlroot.querySelector("library_controllers");
		if(!xmllibrarycontrollers)
			return null;

		var xmllibrarycontrollers_childs = xmllibrarycontrollers.childNodes;

		for(var i = 0; i < xmllibrarycontrollers_childs.length; ++i)
		{
			var xmlcontroller = xmllibrarycontrollers_childs.item(i);
			if(xmlcontroller.nodeType != 1 || xmlcontroller.localName != "controller") //no tag
				continue;
			var id = xmlcontroller.getAttribute("id");
			//we have already processed this controller
			if( this._controllers_found[ id ] )
				continue;

			//console.log("Controller missing!: " + id );
			this.readController( xmlcontroller, null, scene );
		}
	},

	//used for skinning and morphing
	readController: function(xmlcontroller, flip, scene)
	{
		if(!xmlcontroller.localName == "controller")
		{
			console.warn("readController: not a controller: " + xmlcontroller.localName);
			return null;
		}

		var id = xmlcontroller.getAttribute("id");

		var use_indices = false;
		var mesh = null;
		var xmlskin = xmlcontroller.querySelector("skin");
		if(xmlskin)
			mesh = this.readSkinController( xmlskin, flip, scene);

		var xmlmorph = xmlcontroller.querySelector("morph");
		if(xmlmorph)
			mesh = this.readMorphController( xmlmorph, flip, scene, mesh );

		this._controllers_found[ id ] = mesh;

		return mesh;
	},

	//read this to more info about DAE and skinning https://collada.org/mediawiki/index.php/Skinning
	readSkinController: function( xmlskin, flip, scene )
	{
		//base geometry
		var id_geometry = xmlskin.getAttribute("source");
		var mesh = this.readGeometry( id_geometry, flip, scene );
		if(!mesh)
			return null;

		var sources = this.readSources(xmlskin, flip);
		if(!sources)
			return null;

		//matrix
		var bind_matrix = null;
		var xmlbindmatrix = xmlskin.querySelector("bind_shape_matrix");
		if(xmlbindmatrix)
		{
			bind_matrix = this.readContentAsFloats( xmlbindmatrix );
			this.transformMatrix(bind_matrix, true, true );			
		}
		else
			bind_matrix = mat4.create(); //identity

		//joints
		var joints = [];
		var xmljoints = xmlskin.querySelector("joints");
		if(xmljoints)
		{
			var joints_source = null; //which bones
			var inv_bind_source = null; //bind matrices
			var xmlinputs = xmljoints.querySelectorAll("input");
			for(var i = 0; i < xmlinputs.length; i++)
			{
				var xmlinput = xmlinputs[i];
				var sem = xmlinput.getAttribute("semantic").toUpperCase();
				var src = xmlinput.getAttribute("source");
				var source = sources[ src.substr(1) ];
				if(sem == "JOINT")
					joints_source = source;
				else if(sem == "INV_BIND_MATRIX")
					inv_bind_source = source;
			}

			//save bone names and inv matrix
			if(!inv_bind_source || !joints_source)
			{
				console.error("Error DAE: no joints or inv_bind sources found");
				return null;
			}

			for(var i in joints_source)
			{
				//get the inverse of the bind pose
				var inv_mat = inv_bind_source.subarray(i*16,i*16+16);
				var nodename = joints_source[i];
				var node = this._nodes_by_id[ nodename ];
				if(!node)
				{
					console.warn("Node " + nodename + " not found");
					continue;
				}
				this.transformMatrix(inv_mat, node._depth == 0, true );
				joints.push([ nodename, inv_mat ]);
			}
		}

		//weights
		var xmlvertexweights = xmlskin.querySelector("vertex_weights");
		if(xmlvertexweights)
		{
			//here we see the order 
			var weights_indexed_array = null;
			var xmlinputs = xmlvertexweights.querySelectorAll("input");
			for(var i = 0; i < xmlinputs.length; i++)
			{
				if( xmlinputs[i].getAttribute("semantic").toUpperCase() == "WEIGHT" )
					weights_indexed_array = sources[ xmlinputs.item(i).getAttribute("source").substr(1) ];
			}

			if(!weights_indexed_array)
				throw("no weights found");

			var xmlvcount = xmlvertexweights.querySelector("vcount");
			var vcount = this.readContentAsUInt32( xmlvcount );

			var xmlv = xmlvertexweights.querySelector("v");
			var v = this.readContentAsUInt32( xmlv );

			var num_vertices = mesh.vertices.length / 3; //3 components per vertex
			var weights_array = new Float32Array(4 * num_vertices); //4 bones per vertex
			var bone_index_array = new Uint8Array(4 * num_vertices); //4 bones per vertex

			var pos = 0;
			var remap = mesh._remap;
			var max_bone = 0; //max bone affected

			for(var i = 0, l = vcount.length; i < l; ++i)
			{
				var num_bones = vcount[i]; //num bones influencing this vertex

				//find 4 with more influence
				//var v_tuplets = v.subarray(offset, offset + num_bones*2);

				var offset = pos;
				var b = bone_index_array.subarray(i*4, i*4 + 4);
				var w = weights_array.subarray(i*4, i*4 + 4);

				var sum = 0;
				for(var j = 0; j < num_bones && j < 4; ++j)
				{
					b[j] = v[offset + j*2];
					if(b[j] > max_bone) max_bone = b[j];

					w[j] = weights_indexed_array[ v[offset + j*2 + 1] ];
					sum += w[j];
				}

				//normalize weights
				if(num_bones > 4 && sum < 1.0)
				{
					var inv_sum = 1/sum;
					for(var j = 0; j < 4; ++j)
						w[j] *= inv_sum;
				}

				pos += num_bones * 2;
			}


			//remap: because vertices order is now changed after parsing the mesh
			var final_weights = new Float32Array(4 * num_vertices); //4 bones per vertex
			var final_bone_indices = new Uint8Array(4 * num_vertices); //4 bones per vertex
			var used_joints = [];

			//for every vertex in the mesh, process bone indices and weights
			for(var i = 0; i < num_vertices; ++i)
			{
				var p = remap[ i ] * 4;
				var w = weights_array.subarray(p,p+4);
				var b = bone_index_array.subarray(p,p+4);

				//sort by weight so relevant ones goes first
				for(var k = 0; k < 3; ++k)
				{
					var max_pos = k;
					var max_value = w[k];
					for(var j = k+1; j < 4; ++j)
					{
						if(w[j] <= max_value)
							continue;
						max_pos = j;
						max_value = w[j];
					}
					if(max_pos != k)
					{
						var tmp = w[k];
						w[k] = w[max_pos];
						w[max_pos] = tmp;
						tmp = b[k];
						b[k] = b[max_pos]; 
						b[max_pos] = tmp;
					}
				}

				//store
				final_weights.set( w, i*4);
				final_bone_indices.set( b, i*4);

				//mark bones used
				if(w[0]) used_joints[b[0]] = true;
				if(w[1]) used_joints[b[1]] = true;
				if(w[2]) used_joints[b[2]] = true;
				if(w[3]) used_joints[b[3]] = true;
			}

			if(max_bone >= joints.length)
				console.warn("Mesh uses higher bone index than bones found");

			//trim unused bones (collada could give you 100 bones for an object that only uses a fraction of them)
			if(1)
			{
				var new_bones = [];
				var bones_translation = {};
				for(var i = 0; i < used_joints.length; ++i)
					if(used_joints[i])
					{
						bones_translation[i] = new_bones.length;
						new_bones.push( joints[i] );
					}

				//in case there are less bones in use...
				if(new_bones.length < joints.length)
				{
					//remap
					for(var i = 0; i < final_bone_indices.length; i++)
						final_bone_indices[i] = bones_translation[ final_bone_indices[i] ];
					joints = new_bones;
				}
				//console.log("Bones: ", joints.length, " used:", num_used_joints );
			}

			//console.log("Bones: ", joints.length, "Max bone: ", max_bone);

			mesh.weights = final_weights;
			mesh.bone_indices = final_bone_indices;
			mesh.bones = joints;
			mesh.bind_matrix = bind_matrix;

			delete mesh["_remap"];
		}

		return mesh;
	},

	//NOT TESTED
	readMorphController: function(xmlmorph, flip, scene, mesh)
	{
		var id_geometry = xmlmorph.getAttribute("source");
		var base_mesh = this.readGeometry( id_geometry, flip, scene );
		if(!base_mesh)
			return null;

		//read sources with blend shapes info (which ones, and the weight)
		var sources = this.readSources(xmlmorph, flip);

		var morphs = [];

		//targets
		var xmltargets = xmlmorph.querySelector("targets");
		if(!xmltargets)
			return null;

		var xmlinputs = xmltargets.querySelectorAll("input");
		var targets = null;
		var weights = null;

		for(var i = 0; i < xmlinputs.length; i++)
		{
			var xmlinput = xmlinputs.item(i);
			var semantic = xmlinput.getAttribute("semantic").toUpperCase();
			var data = sources[ xmlinput.getAttribute("source").substr(1) ];
			if( semantic == "MORPH_TARGET" )
				targets = data;
			else if( semantic == "MORPH_WEIGHT" )
				weights = data;
		}

		if(!targets || !weights)
		{
			console.warn("Morph controller without targets or weights. Skipping it.");
			return null;
		}

		//get targets
		for(var i in targets)
		{
			var id = "#" + targets[i];
			var geometry = this.readGeometry( id, flip, scene );
			scene.meshes[ id ] = geometry;
			morphs.push( { mesh: id, weight: weights[i]} );
		}

		base_mesh.morph_targets = morphs;
		return base_mesh;
	},

	readBindMaterials: function( xmlbind_material, mesh )
	{
		var materials = [];

		var xmltechniques = xmlbind_material.querySelectorAll("technique_common");
		for(var i = 0; i < xmltechniques.length; i++)
		{
			var xmltechnique = xmltechniques.item(i);
			var xmlinstance_materials = xmltechnique.querySelectorAll("instance_material");
			for(var j = 0; j < xmlinstance_materials.length; j++)
			{
				var xmlinstance_material = xmlinstance_materials.item(j);
				if(xmlinstance_material)
					materials.push( xmlinstance_material.getAttribute("symbol") );
			}
		}

		return materials;
	},

	readSources: function(xmlnode, flip)
	{
		//for data sources
		var sources = {};
		var xmlsources = xmlnode.querySelectorAll("source");
		for(var i = 0; i < xmlsources.length; i++)
		{
			var xmlsource = xmlsources.item(i);
			if(!xmlsource.querySelector) //??
				continue;

			var float_array = xmlsource.querySelector("float_array");
			if(float_array)
			{
				var floats = this.readContentAsFloats( xmlsource );
				sources[ xmlsource.getAttribute("id") ] = floats;
				continue;
			}

			var name_array = xmlsource.querySelector("Name_array");
			if(name_array)
			{
				var names = this.readContentAsStringsArray( name_array );
				if(!names)
					continue;
				sources[ xmlsource.getAttribute("id") ] = names;
				continue;
			}

			var ref_array = xmlsource.querySelector("IDREF_array");
			if(ref_array)
			{
				var names = this.readContentAsStringsArray( ref_array );
				if(!names)
					continue;
				sources[ xmlsource.getAttribute("id") ] = names;
				continue;
			}
		}

		return sources;
	},

	readContentAsUInt32: function(xmlnode)
	{
		if(!xmlnode) return null;
		var text = xmlnode.textContent;
		text = text.replace(/\n/gi, " "); //remove line breaks
		text = text.trim(); //remove empty spaces
		if(text.length == 0) return null;
		var numbers = text.split(" "); //create array
		var floats = new Uint32Array( numbers.length );
		for(var k = 0; k < numbers.length; k++)
			floats[k] = parseInt( numbers[k] );
		return floats;
	},

	readContentAsFloats: function(xmlnode)
	{
		if(!xmlnode) return null;
		var text = xmlnode.textContent;
		text = text.replace(/\n/gi, " "); //remove line breaks
		text = text.replace(/\s\s+/gi, " ");
		text = text.replace(/\t/gi, "");
		text = text.trim(); //remove empty spaces
		var numbers = text.split(" "); //create array
		var count = xmlnode.getAttribute("count");
		var length = count ? parseInt( count  ) : numbers.length;
		var floats = new Float32Array( length );
		for(var k = 0; k < numbers.length; k++)
			floats[k] = parseFloat( numbers[k] );
		return floats;
	},
	
	readContentAsStringsArray: function(xmlnode)
	{
		if(!xmlnode) return null;
		var text = xmlnode.textContent;
		text = text.replace(/\n/gi, " "); //remove line breaks
		text = text.replace(/\s\s/gi, " ");
		text = text.trim(); //remove empty spaces
		var words = text.split(" "); //create array
		for(var k = 0; k < words.length; k++)
			words[k] = words[k].trim();
		if(xmlnode.getAttribute("count") && parseInt(xmlnode.getAttribute("count")) != words.length)
		{
			var merged_words = [];
			var name = "";
			for (var i in words)
			{
				if(!name)
					name = words[i];
				else
					name += " " + words[i];
				if(!this._nodes_by_id[ this.safeString(name) ])
					continue;
				merged_words.push( this.safeString(name) );
				name = "";
			}

			var count = parseInt(xmlnode.getAttribute("count"));
			if(merged_words.length == count)
				return merged_words;

			console.error("Error: bone names have spaces, avoid using spaces in names");
			return null;
		}
		return words;
	},

	max3d_matrix_0: new Float32Array([0, -1, 0, 0, 0, 0, -1, 0, 1, 0, 0, -0, 0, 0, 0, 1]),
	//max3d_matrix_other: new Float32Array([0, -1, 0, 0, 0, 0, -1, 0, 1, 0, 0, -0, 0, 0, 0, 1]),

	transformMatrix: function(matrix, first_level, inverted)
	{
		mat4.transpose(matrix,matrix);

		if(this.no_flip)
			return matrix;

		//WARNING: DO NOT CHANGE THIS FUNCTION, THE SKY WILL FALL
		if(first_level){

			//flip row two and tree
			var temp = new Float32Array(matrix.subarray(4,8)); //swap rows
			matrix.set( matrix.subarray(8,12), 4 );
			matrix.set( temp, 8 );

			//reverse Z
			temp = matrix.subarray(8,12);
			vec4.scale(temp,temp,-1);
		}
		else 
		{
			var M = mat4.create();
			var m = matrix;

			//if(inverted) mat4.invert(m,m);

			/* non trasposed
			M.set([m[0],m[8],-m[4]], 0);
			M.set([m[2],m[10],-m[6]], 4);
			M.set([-m[1],-m[9],m[5]], 8);
			M.set([m[3],m[11],-m[7]], 12);
			*/

			M.set([m[0],m[2],-m[1]], 0);
			M.set([m[8],m[10],-m[9]], 4);
			M.set([-m[4],-m[6],m[5]], 8);
			M.set([m[12],m[14],-m[13]], 12);

			m.set(M);

			//if(inverted) mat4.invert(m,m);

		}
		return matrix;
	}
};


//add worker launcher
if(!isWorker)
{
	Collada.launchWorker = function()
	{
		var worker = this.worker = new Worker( Collada.workerPath + "collada.js" );
		worker.callback_ids = {};

		worker.addEventListener('error', function(e){
			if (Collada.onerror)
				Collada.onerror(err);
		});

		//main thread receives a message from worker
		worker.addEventListener('message', function(e) {
			if(!e.data)
				return;

			var data = e.data;

			switch(data.action)
			{
				case "log": console.log.apply( console, data.params ); break;
				case "warn": console.warn.apply( console, data.params ); break;
				case "exception": 
					console.error.apply( console, data.params ); 
					if(Collada.onerror)
						Collada.onerror(data.msg);
					break;
				case "error": console.error.apply( console, data.params ); break;
				case "result": 
					var callback = this.callback_ids[ data.callback_id ];
					if(!callback)
						throw("callback not found");
					callback( data.result );
					break;
				default:
					console.warn("Unknown action:", data.action);
					break;
			}
		});

		this.callback_ids = {};
		this.last_callback_id = 1;

		this.toWorker("init", [this.config] );
	}

	Collada.toWorker = function( func_name, params, callback )
	{
		if(!this.worker)
			this.launchWorker();

		var id = this.last_callback_id++;
		this.worker.callback_ids[ id ] = callback;
		this.worker.postMessage({ func: func_name, params: params, callback_id: id });
	}

	Collada.loadInWorker = function( url, callback )
	{
		this.toWorker("loadInWorker", [url], callback );
	}

	Collada.parseInWorker = function( data, callback )
	{
		this.toWorker("parseInWorker", [data], callback );
	}

}
else //in worker
{
	Collada.loadInWorker = function(callback, url) { 
		Collada.load(url, callback);
	}

	Collada.parseInWorker = function(callback, data) { 
		callback( Collada.parse(data) );
	}
}


function request(url, callback)
{
	var req = new XMLHttpRequest();
	req.onload = function() {
		var response = this.response;
		if(this.status != 200)
			return;
		if(callback)
			callback(this.response);
	};
	if(url.indexOf("://") == -1)
		url = Collada.dataPath + url;
	req.open("get", url, true);
	req.send();
}

//global event catcher
if(isWorker)
{
	self.addEventListener('message', function(e) {

		if(e.data.func == "init")
			return Collada.init.apply( Collada, e.data.params );

		var func_name = e.data.func;
		var params = e.data.params;
		var callback_id = e.data.callback_id;

		//callback when the work is done
		var callback = function(result){
			self.postMessage({action:"result", callback_id: callback_id, result: result}, Collada._transferables );
			Collada._transferables = null;
		}

		var func = Collada[func_name];

		if( func === undefined)
		{
			console.error("function not found:", func_name);
			callback(null);
		}
		else
		{
			try
			{
				func.apply( Collada, params ? [callback].concat(params) : [callback]);
			}
			catch (err)
			{
				console.error("Error inside worker function call to " + func_name + " :: " + err);
				callback(null);
			}
		}

	}, false);
}

})( typeof(window) != "undefined" ? window : self );

var parserDAE = {
	extension: "dae",
	type: "scene",
	resource: "SceneNode",
	format: "text",
	dataType:'text',

	parse: function( data, options, filename )
	{
		if(!data || data.constructor !== String)
		{
			console.error("DAE parser requires string");
			return null;
		}

		Collada.material_translate_table = {
			reflectivity: "reflection_factor",
			specular: "specular_factor",
			shininess: "specular_gloss",
			emission: "emissive",
			diffuse: "color"
		}; //this is done to match LS specification

		var clean_filename = LS.RM.getFilename(filename);

		//parser moved to Collada.js library
		var scene = Collada.parse( data, options, clean_filename );
		console.log( scene ); 

		scene.root.name = clean_filename;

		//apply 90 degrees rotation to match the Y UP AXIS of the system
		if( scene.metadata && scene.metadata.up_axis == "Z_UP" )
			scene.root.model = mat4.rotateX( mat4.create(), mat4.create(), -90 * 0.0174532925 );

		//skip renaming ids (this is done to ensure no collision with names coming from other files)
		if(options.skip_renaming)
			return scene;

		//rename meshes, nodes, etc
		var renamed = {};
		var basename = clean_filename.substr(0, clean_filename.indexOf("."));

		//rename meshes names
		var renamed_meshes = {};
		for(var i in scene.meshes)
		{
			var newmeshname = basename + "__" + i;
			newmeshname = newmeshname.replace(/[^a-z0-9]/gi,"_"); //newmeshname.replace(/ /#/g,"_");
			renamed[ i ] = newmeshname;
			renamed_meshes[ newmeshname ] = scene.meshes[i];
		}
		scene.meshes = renamed_meshes;

		//rename morph targets names
		for(var i in scene.meshes)
		{
			var mesh = scene.meshes[i];
			if(mesh.morph_targets)
				for(var j = 0; j < mesh.morph_targets.length; ++j)
				{
					var morph = mesh.morph_targets[j];
					if(morph.mesh && renamed[ morph.mesh ])
						morph.mesh = renamed[ morph.mesh ];
				}
		}


		//change local collada ids to valid uids 
		replace_uids( scene.root );

		function replace_uids( node )
		{
			//change uid
			if(node.id)
			{
				node.uid = "@" + basename + "::" + node.id;
				renamed[ node.id ] = node.uid;
			}

			
			if(node.type)
			{
				node.node_type = node.type;
				delete node.type; //to be sure it doesnt overlaps with some existing var
			}

			//change mesh names to engine friendly ids
			if(node.mesh && renamed[ node.mesh ])
				node.mesh = renamed[ node.mesh ];

			if(node.children)
				for(var i in node.children)
					replace_uids( node.children[i] );
		}

		//replace skinning joint ids
		for(var i in scene.meshes)
		{
			var mesh = scene.meshes[i];
			if(mesh.bones)
			{
				for(var j in mesh.bones)
				{
					var id = mesh.bones[j][0];
					var uid = renamed[ id ];
					if(uid)
						mesh.bones[j][0] = uid;
				}
			}
		}

		//Materials need some renames
		for(var i in scene.materials)
			this.processMaterial( scene.materials[i] );

		//check resources
		for(var i in scene.resources)
		{
			var res = scene.resources[i];
			if(res.object_type == "Animation")
				this.processAnimation( res, renamed );
		}

		return scene;
	},

	//depending on the 3D software used, animation tracks could be tricky to handle
	processAnimation: function( animation, renamed )
	{
		for(var i in animation.takes)
		{
			var take = animation.takes[i];

			//apply renaming
			for(var j = 0; j < take.tracks.length; ++j)
			{
				var track = take.tracks[j];
				var pos = track.property.indexOf("/");
				if(!pos)
					continue;
				var nodename = track.property.substr(0,pos);
				var extra = track.property.substr(pos);
				if(extra == "/transform") //blender exports matrices as transform
					extra = "/matrix";

				if( !renamed[nodename] )
					continue;
				nodename = renamed[ nodename ];
				track.property = nodename + extra;
			}

			//rotations could come in different ways, some of them are accumulative, which doesnt work in litescene, so we have to accumulate them previously
			var rotated_nodes = {};
			for(var j = 0; j < take.tracks.length; ++j)
			{
				var track = take.tracks[j];
				track.packed_data = true; //hack: this is how it works my loader
				if(track.name == "rotateX.ANGLE" || track.name == "rotateY.ANGLE" || track.name == "rotateZ.ANGLE")
				{
					var nodename = track.property.split("/")[0];
					if(!rotated_nodes[nodename])
						rotated_nodes[nodename] = { tracks: [] };
					rotated_nodes[nodename].tracks.push( track );
				}
			}

			for(var j in rotated_nodes)
			{
				var info = rotated_nodes[j];
				var newtrack = { data: [], type: "quat", value_size: 4, property: j + "/Transform/rotation", name: "rotation" };
				var times = [];

				//collect timestamps
				for(var k = 0; k < info.tracks.length; ++k)
				{
					var track = info.tracks[k];
					var data = track.data;
					for(var w = 0; w < data.length; w+=2)
						times.push( data[w] );
				}

				//create list of timestamps and remove repeated ones
				times.sort();
				var last_time = -1;
				var final_times = [];
				for(var k = 0; k < times.length; ++k)
				{
					if(times[k] == last_time)
						continue;
					final_times.push( times[k] );
					last_time = times[k];
				}
				times = final_times;

				//create samples
				newtrack.data.length = times.length;
				for(var k = 0; k < newtrack.data.length; ++k)
				{
					var time = times[k];
					var value = quat.create();
					//create keyframe
					newtrack.data[k] = [time, value];

					for(var w = 0; w < info.tracks.length; ++w)
					{
						var track = info.tracks[w];
						var sample = getTrackSample( track, time );
						if(!sample) //nothing to do if no sample or 0
							continue;
						sample *= 0.0174532925; //degrees to radians
						switch( track.name )
						{
							case "rotateX.ANGLE": quat.rotateX( value, value, -sample ); break;
							case "rotateY.ANGLE": quat.rotateY( value, value, sample ); break;
							case "rotateZ.ANGLE": quat.rotateZ( value, value, sample ); break;
						}
					}
				}

				//add track
				take.tracks.push( newtrack );

				//remove old rotation tracks
				for(var w = 0; w < info.tracks.length; ++w)
				{
					var track = info.tracks[w];
					var pos = take.tracks.indexOf( track );
					if(pos == -1)
						continue;
					take.tracks.splice(pos,1);
				}

			}

		}//takes

		function getTrackSample( track, time )
		{
			var data = track.data;
			var l = data.length;
			for(var t = 0; t < l; t+=2)
			{
				if(data[t] == time)
					return data[t+1];
				if(data[t] > time)
					return null;
			}
			return null;
		}
	},

	processMaterial: function(material)
	{
		if(material.transparency)
		{
			material.opacity = 1.0 - parseFloat( material.transparency );
			if(material.transparent)
				material.opacity = material.transparency; //why? dont know but works
		}

		if(material.textures)
		{
			for(var i in material.textures)
			{
				var tex_info = material.textures[i];
				var coords = LS.Material.COORDS_UV0;
				if( tex_info.uvs == "TEX1")
					coords = LS.Material.COORDS_UV1;
				tex_info = { 
					texture: tex_info.map_id,
					uvs: coords
				};
				material.textures[i] = tex_info;
			}
		}
	}
};

LS.Formats.registerParser( parserDAE );

var parserDDS = { 
	extension: "dds",
	type: "image",
	dataType:"arraybuffer",
	resource: "Texture",
	format: "binary",

	parse: function(data, options)
	{
		if(!data || data.constructor !== ArrayBuffer)
			throw( "ParserDDS: data must be ArrayBuffer");
		var ext = gl.getExtension("WEBKIT_WEBGL_compressed_texture_s3tc");
		var texture = new GL.Texture(0,0, options);
		if(!window.DDS)
			throw("dds.js script must be included, not found");
		DDS.loadDDSTextureFromMemoryEx(gl,ext, data, texture, true);
		//console.log( DDS.getDDSTextureFromMemoryEx(data) );
		//texture.texture_type = texture.handler.texture_type;
		//texture.width = texture.handler.width;
		//texture.height = texture.handler.height;
		//texture.bind();
		return texture;
	}
};

LS.Formats.registerParser( parserDDS );
//legacy format
var parserJSMesh = { 
	extension: 'jsmesh',
	type: 'mesh',
	format: 'text',
	dataType:'string',

	parse: function(data,options)
	{
		var mesh = null;

		if(typeof(data) == "object")
			mesh = data;
		else if(typeof(data) == "string")
			mesh = JSON.parse(data);

		if(mesh.vertices.constructor == Array) //for deprecated formats
		{
			mesh.vertices = typeof( mesh.vertices[0] ) == "number" ? mesh.vertices : linearizeArray(mesh.vertices);
			if(mesh.normals) mesh.normals = typeof( mesh.normals[0] ) == "number" ? mesh.normals : linearizeArray(mesh.normals);
			if(mesh.coords) mesh.coords = typeof( mesh.coords[0] ) == "number" ? mesh.coords : linearizeArray(mesh.coords);
			if(mesh.triangles) mesh.triangles = typeof( mesh.triangles[0] ) == "number" ? mesh.triangles : linearizeArray(mesh.triangles);

			mesh.vertices = new Float32Array(mesh.vertices);
			if(mesh.normals) mesh.normals = new Float32Array(mesh.normals);
			if(mesh.coords) mesh.coords = new Float32Array(mesh.coords);
			if(mesh.triangles) mesh.triangles = new Uint16Array(mesh.triangles);
		}

		if(!mesh.bounding)
			mesh.bounding = LS.Formats.computeMeshBounding(mesh.vertices);
		return mesh;
	}
};

LS.Formats.registerParser(parserJSMesh);

//***** OBJ parser adapted from SpiderGL implementation *****************
var parserOBJ = {
	extension: 'obj',
	type: 'mesh',
	resource: 'Mesh',
	format: 'text',
	dataType:'text',

	flipAxis: false,

	parse: function(text, options)
	{
		options = options || {};

		var support_uint = true;
		var skip_indices = options.noindex ? options.noindex : false;
		//skip_indices = true;

		//final arrays (packed, lineal [ax,ay,az, bx,by,bz ...])
		var positionsArray = [ ];
		var texcoordsArray = [ ];
		var normalsArray   = [ ];
		var indicesArray   = [ ];

		//unique arrays (not packed, lineal)
		var positions = [ ];
		var texcoords = [ ];
		var normals   = [ ];
		var facemap   = { };
		var index     = 0;

		var line = null;
		var f   = null;
		var pos = 0;
		var tex = 0;
		var nor = 0;
		var x   = 0.0;
		var y   = 0.0;
		var z   = 0.0;
		var tokens = null;

		var hasPos = false;
		var hasTex = false;
		var hasNor = false;

		var parsingFaces = false;
		var indices_offset = 0;
		var negative_offset = -1; //used for weird objs with negative indices
		var max_index = 0;

		//trace("SKIP INDICES: " + skip_indices);
		var flip_axis = (this.flipAxis || options.flipAxis);
		var flip_normals = (flip_axis || options.flipNormals);

		//used for mesh groups (submeshes)
		var group = null;
		var group_id = 0;
		var groups = [];
		var groups_by_name = {};
		var materials_found = {};

		var lines = text.split("\n");
		var length = lines.length;
		for (var lineIndex = 0;  lineIndex < length; ++lineIndex) {
			line = lines[lineIndex].replace(/[ \t]+/g, " ").replace(/\s\s*$/, ""); //better than trim

			if (line[0] == "#")
				continue;
			if(line == "")
				continue;

			tokens = line.split(" ");

			if(parsingFaces && tokens[0] == "v") //another mesh?
			{
				indices_offset = index;
				parsingFaces = false;
				//trace("multiple meshes: " + indices_offset);
			}

			if (tokens[0] == "v") {
				if(flip_axis) //maya and max notation style
					positions.push(-1*parseFloat(tokens[1]),parseFloat(tokens[3]),parseFloat(tokens[2]));
				else
					positions.push(parseFloat(tokens[1]),parseFloat(tokens[2]),parseFloat(tokens[3]));
			}
			else if (tokens[0] == "vt") {
				texcoords.push(parseFloat(tokens[1]),parseFloat(tokens[2]));
			}
			else if (tokens[0] == "vn") {

				if(flip_normals)  //maya and max notation style
					normals.push(-parseFloat(tokens[2]),-parseFloat(tokens[3]),parseFloat(tokens[1]));
				else
					normals.push(parseFloat(tokens[1]),parseFloat(tokens[2]),parseFloat(tokens[3]));
			}
			else if (tokens[0] == "f") {
				parsingFaces = true;

				if (tokens.length < 4)
					continue; //faces with less that 3 vertices? nevermind

				//for every corner of this polygon
				var polygon_indices = [];
				for (var i=1; i < tokens.length; ++i) 
				{
					var faceid = group_id + ":" + tokens[i];
					if (  !(faceid in facemap) || skip_indices )
					{
						f = tokens[i].split("/");

						if (f.length == 1) { //unpacked
							pos = parseInt(f[0]) - 1;
							tex = pos;
							nor = pos;
						}
						else if (f.length == 2) { //no normals
							pos = parseInt(f[0]) - 1;
							tex = parseInt(f[1]) - 1;
							nor = -1;
						}
						else if (f.length == 3) { //all three indexed
							pos = parseInt(f[0]) - 1;
							tex = parseInt(f[1]) - 1;
							nor = parseInt(f[2]) - 1;
						}
						else {
							console.log("Problem parsing: unknown number of values per face");
							return false;
						}

						/*
						//pos = Math.abs(pos); tex = Math.abs(tex); nor = Math.abs(nor);
						if(pos < 0) pos = positions.length/3 + pos - negative_offset;
						if(tex < 0) tex = texcoords.length/2 + tex - negative_offset;
						if(nor < 0) nor = normals.length/3 + nor - negative_offset;
						*/

						if(i > 3 && skip_indices) //polys
						{
							//first
							var pl = positionsArray.length;
							positionsArray.push( positionsArray[pl - (i-3)*9], positionsArray[pl - (i-3)*9 + 1], positionsArray[pl - (i-3)*9 + 2]);
							positionsArray.push( positionsArray[pl - 3], positionsArray[pl - 2], positionsArray[pl - 1]);
							pl = texcoordsArray.length;
							texcoordsArray.push( texcoordsArray[pl - (i-3)*6], texcoordsArray[pl - (i-3)*6 + 1]);
							texcoordsArray.push( texcoordsArray[pl - 2], texcoordsArray[pl - 1]);
							pl = normalsArray.length;
							normalsArray.push( normalsArray[pl - (i-3)*9], normalsArray[pl - (i-3)*9 + 1], normalsArray[pl - (i-3)*9 + 2]);
							normalsArray.push( normalsArray[pl - 3], normalsArray[pl - 2], normalsArray[pl - 1]);
						}

						x = 0.0;
						y = 0.0;
						z = 0.0;
						if ((pos * 3 + 2) < positions.length)
						{
							hasPos = true;
							if(pos < 0) //negative indices are relative to the end
								pos = positions.length / 3 + pos + 1;
							x = positions[pos*3+0];
							y = positions[pos*3+1];
							z = positions[pos*3+2];
						}

						positionsArray.push(x,y,z);
						//positionsArray.push([x,y,z]);

						x = 0.0;
						y = 0.0;
						if ((tex * 2 + 1) < texcoords.length)
						{
							hasTex = true;
							if(tex < 0) //negative indices are relative to the end
								tex = texcoords.length / 2 + tex + 1;
							x = texcoords[tex*2+0];
							y = texcoords[tex*2+1];
						}
						texcoordsArray.push(x,y);
						//texcoordsArray.push([x,y]);

						x = 0.0;
						y = 0.0;
						z = 1.0;
						if(nor != -1)
						{
							if ((nor * 3 + 2) < normals.length)
							{
								hasNor = true;

								if(nor < 0)
									nor = normals.length / 3 + nor + 1;
								x = normals[nor*3+0];
								y = normals[nor*3+1];
								z = normals[nor*3+2];
							}
							
							normalsArray.push(x,y,z);
							//normalsArray.push([x,y,z]);
						}

						//Save the string "10/10/10" and tells which index represents it in the arrays
						if(!skip_indices)
							facemap[ faceid ] = index++;
					}//end of 'if this token is new (store and index for later reuse)'

					//store key for this triplet
					if(!skip_indices)
					{
						var final_index = facemap[ faceid ];
						polygon_indices.push( final_index );
						if(max_index < final_index)
							max_index = final_index;
					}
				} //end of for every token on a 'f' line

				//polygons (not just triangles)
				if(!skip_indices)
				{
					for(var iP = 2; iP < polygon_indices.length; iP++)
					{
						indicesArray.push( polygon_indices[0], polygon_indices[iP-1], polygon_indices[iP] );
						//indicesArray.push( [polygon_indices[0], polygon_indices[iP-1], polygon_indices[iP]] );
					}
				}
			}
			else if (tokens[0] == "g" || tokens[0] == "o")
			{
				negative_offset = positions.length / 3 - 1;

				if(tokens.length > 1)
				{
					var group_pos = (indicesArray.length ? indicesArray.length : positionsArray.length / 3);
					if(group != null)
					{
						group.length = group_pos - group.start;
						if(group.length > 0) //there are triangles...
						{
							groups_by_name[ group_name ] = group;
							groups.push(group);
							group_id++;
						}
					}

					var group_name = tokens[1];
					if(groups_by_name[group_name])
						group_name = group_name + "." + group_id;

					group = {
						name: group_name,
						start: group_pos,
						length: -1,
						material: ""
					};

					/*
					if(tokens[0] == "g")
					{
						group_vertex_start = positions.length / 3;
						group_normal_start = normals.length / 3;
						group_coord_start = texcoords.length / 2;
					}
					*/
				}
			}
			else if (tokens[0] == "usemtl") {
				if(group)
					group.material = tokens[1];
			}
			else if (tokens[0] == "o" || tokens[0] == "s") {
				//ignore
			}
			else
			{
				console.warn("unknown code: " + line);
			}
		}

		if(group && (indicesArray.length - group.start) > 1)
		{
			group.length = indicesArray.length - group.start;
			groups.push(group);
		}

		//deindex streams
		if((max_index > 256*256 || skip_indices ) && indicesArray.length > 0 && !support_uint )
		{
			console.log("Deindexing mesh...")
			var finalVertices = new Float32Array(indicesArray.length * 3);
			var finalNormals = normalsArray && normalsArray.length ? new Float32Array(indicesArray.length * 3) : null;
			var finalTexCoords = texcoordsArray && texcoordsArray.length ? new Float32Array(indicesArray.length * 2) : null;
			for(var i = 0; i < indicesArray.length; i += 1)
			{
				finalVertices.set( positionsArray.slice( indicesArray[i]*3,indicesArray[i]*3 + 3), i*3 );
				if(finalNormals)
					finalNormals.set( normalsArray.slice( indicesArray[i]*3,indicesArray[i]*3 + 3 ), i*3 );
				if(finalTexCoords)
					finalTexCoords.set( texcoordsArray.slice(indicesArray[i]*2,indicesArray[i]*2 + 2 ), i*2 );
			}
			positionsArray = finalVertices;
			if(finalNormals)
				normalsArray = finalNormals;
			if(finalTexCoords)
				texcoordsArray = finalTexCoords;
			indicesArray = null;
		}

		//Create final mesh object
		var mesh = {};

		//create typed arrays
		if (hasPos)
			mesh.vertices = new Float32Array(positionsArray);
		if (hasNor && normalsArray.length > 0)
			mesh.normals = new Float32Array(normalsArray);
		if (hasTex && texcoordsArray.length > 0)
			mesh.coords = new Float32Array(texcoordsArray);
		if (indicesArray && indicesArray.length > 0)
			mesh.triangles = new Uint16Array(indicesArray);

		//extra info
		mesh.bounding = GL.Mesh.computeBounding(mesh.vertices);
		var info = {};
		if(groups.length > 1)
			info.groups = groups;
		mesh.info = info;
		if( mesh.bounding.radius == 0 || isNaN(mesh.bounding.radius))
			console.log("no radius found in mesh");
		return mesh;
	}
};

LS.Formats.registerParser( parserOBJ );




//***** MTL parser *****************
//info from: http://paulbourke.net/dataformats/mtl/
var parserMTL = {
	extension: 'mtl',
	type: 'material',
	resource: 'StandardMaterial',
	format: 'text',
	dataType:'text',

	parse: function( text, options )
	{
		var lines = text.split("\n");
		var length = lines.length;

		var materials = {};
		var current_material = null;

		for (var lineIndex = 0;  lineIndex < length; ++lineIndex)
		{
			var line = lines[lineIndex].replace(/[ \t]+/g, " ").replace(/\s\s*$/, ""); //trim

			if (line[0] == "#" || line == "")
				continue;

			var tokens = line.split(" ");
			var c = tokens[0];
			switch(c)
			{
				case "newmtl":
					current_material = { filename: tokens[1], textures: {} };
					materials[ tokens[1] ] = current_material;
					break;
				case "Ka":
					current_material.ambient = readVector3(tokens);
					break;
				case "Kd":
					current_material.color = readVector3(tokens);
					break;
				case "Ks":
					current_material.specular_factor = parseFloat(tokens[1]); //readVector3(tokens);
					break;
				case "Ns": //glossiness
					current_material.specular_gloss = parseFloat(tokens[1]);
					break;
				case "map_Kd":
					current_material.textures["color"] = this.clearPath( tokens[1] );
					break;
				case "map_Ka":
					current_material.textures["ambient"] = this.clearPath( tokens[1] );
					break;
				case "map_Ks":
					current_material.textures["specular"] = this.clearPath( tokens[1] );
					break;
				case "d": //disolve is like transparency
					current_material.opacity = parseFloat( tokens[1] );
					break;
				//Not supported stuff
				case "illum": //illumination model (raytrace related)
				case "Ni": //refraction coefficient
					break;
			}
		}

		for(var i in materials)
		{
			var material_info = materials[i];
			var material = new LS.StandardMaterial(material_info);
			LS.RM.registerResource( material_info.filename, material );
		}

		return null;

		function readVector3(v)
		{
			return [ parseFloat(v[1]), parseFloat(v[2]), parseFloat(v[3]) ];
		}
	},

	clearPath: function(path)
	{
		var pos = path.lastIndexOf("\\");
		if(pos != -1)
			path = path.substr(pos+1);
		var filename = LS.RM.getFilename(path);
		if( LS.RM.resources_renamed_recently[filename] )
			filename = LS.RM.resources_renamed_recently[filename];
		return filename;
	}
};

LS.Formats.registerParser( parserMTL );
//***** STL Parser *****************
//based on https://github.com/tonylukasavage/jsstl
var parserSTL = {
	extension: 'stl',
	type: 'mesh',
	format: 'binary',
	dataType:'arraybuffer',
	
	parse: function( data, options )
	{
		options = options || {};

		var positionsArray = [];
		var normalsArray = [];
		var indicesArray = [];

		var dv = new DataView(data, 80); // 80 == unused header
		var isLittleEndian = true;
		var triangles = dv.getUint32(0, isLittleEndian); 
		// console.log('arraybuffer length:  ' + stl.byteLength);
		console.log('number of triangles: ' + triangles);
		var offset = 4;

		var tempA = vec3.create();
		var tempB = vec3.create();
		var tempC = vec3.create();
		var tempN = vec3.create();

		for (var i = 0; i < triangles; i++) {
			// Get the normal for this triangle
			var nx = dv.getFloat32(offset, isLittleEndian);
			var ny = dv.getFloat32(offset+4, isLittleEndian);
			var nz = dv.getFloat32(offset+8, isLittleEndian);

			offset += 12;
			// Get all 3 vertices for this triangle
			for (var j = 0; j < 3; j++) {
				var x = dv.getFloat32(offset, isLittleEndian);
				var y = dv.getFloat32(offset+4, isLittleEndian);
				var z = dv.getFloat32(offset+8, isLittleEndian);
				//positionsArray.push(x,y,z);
				positionsArray.push(x,z,-y); //flipped
				offset += 12
			}
			
			if(nx == 0 && ny == 0 && nz == 0) //compute normal
			{
				var l = positionsArray.length;
				tempA.set( positionsArray.slice(l-9,l-6) );
				tempB.set( positionsArray.slice(l-6,l-3) );
				tempC.set( positionsArray.slice(l-3,l) );
				vec3.sub( tempB, tempB, tempA );
				vec3.sub( tempC, tempC, tempA );
				vec3.cross( tempN, tempC, tempB );
				nx = tempN[0]; ny = tempN[1]; nz = tempN[2];
			}

			//normalsArray.push(nx,ny,nz,nx,ny,nz,nx,ny,nz);
			normalsArray.push(nx,nz,-ny,nx,nz,-ny,nx,nz,-ny); //flipped

			// there's also a Uint16 "attribute byte count" that we
			// don't need, it should always be zero.
			offset += 2;   
			// Create a new face for from the vertices and the normal             
			//indicesArray.push( i*3, i*3+1, i*3+2 );
		}
		// The binary STL I'm testing with seems to have all
		// zeroes for the normals, unlike its ASCII counterpart.
		// We can use three.js to compute the normals for us, though,
		// once we've assembled our geometry. This is a relatively 
		// expensive operation, but only needs to be done once.

		var mesh = { info: {} };

		mesh.vertices = new Float32Array(positionsArray);
		if (normalsArray.length > 0)
			mesh.normals = new Float32Array(normalsArray);
		if (indicesArray && indicesArray.length > 0)
			mesh.triangles = new Uint16Array(indicesArray);

		//extra info
		mesh.bounding = LS.Formats.computeMeshBounding( mesh.vertices );
		return mesh;
	}
};

LS.Formats.registerParser( parserSTL );

var parserTGA = { 
	extension: 'tga',
	type: 'image',
	dataType:"arraybuffer",
	format: 'binary',

	parse: function(data, options)
	{
		if(!data || data.constructor !== ArrayBuffer)
			throw( "ParserTGA: data must be ArrayBuffer");

		data = new Uint8Array(data);
		var TGAheader = new Uint8Array( [0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0] );
		var TGAcompare = data.subarray(0,12);
		for(var i = 0; i < TGAcompare.length; i++)
			if(TGAheader[i] != TGAcompare[i])
				return null; //not a TGA

		var header = data.subarray(12,18);

		var img = {};
		img.width = header[1] * 256 + header[0];
		img.height = header[3] * 256 + header[2];
		img.bpp = header[4];
		img.bytesPerPixel = img.bpp / 8;
		img.imageSize = img.width * img.height * img.bytesPerPixel;
		img.pixels = data.subarray(18,18+img.imageSize);
		img.pixels = new Uint8Array( img.pixels ); 	//clone

		if(	(header[5] & (1<<4)) == 0) //hack, needs swap
		{
			//TGA comes in BGR format so we swap it, this is slooooow
			for(var i = 0; i < img.imageSize; i+= img.bytesPerPixel)
			{
				var temp = img.pixels[i];
				img.pixels[i] = img.pixels[i+2];
				img.pixels[i+2] = temp;
			}
			header[5] |= 1<<4; //mark as swaped
			img.format = img.bpp == 32 ? "RGBA" : "RGB";
		}
		else
			img.format = img.bpp == 32 ? "RGBA" : "RGB";

		//some extra bytes to avoid alignment problems
		//img.pixels = new Uint8Array( img.imageSize + 14);
		//img.pixels.set( data.subarray(18,18+img.imageSize), 0);

		img.flipY = true;
		//img.format = img.bpp == 32 ? "BGRA" : "BGR";
		//trace("TGA info: " + img.width + "x" + img.height );
		return img;
	}
};

LS.Formats.registerParser( parserTGA );
//3dcgart format (probably three.js)
//Array.prototype.flatten1=function(){return this.reduce(function(a,b){return a.concat(b)},[])};

var parserCGArtMesh = { 
	extension: 'cgart',
	type: 'mesh',
	format: 'text',
	dataType:'string',

	parse: function(data,options)
	{
		var m = null;

		if(typeof(data) == "object")
			m = data;
		else if(typeof(data) == "string")
			m = JSON.parse(data);

		m.faces = m.faces[0];
		m.normals = m.normals[0];
		m.vertices = m.vertices[0];
		m.uvs = m.uvs[0][0];

		var vertices = [];
		var normals = [];
		var uvs = [];

		var group = null;
		var groups = [];

		var i = 0;
		var current_mat_id = 0;
		while( i < m.faces.length )
		{
			if(m.faces[i] == 43) //quad
			{
				//material info
				var mat_id = m.faces[i+5];
				if(current_mat_id < mat_id)
				{
					current_mat_id = mat_id;
					if(group != null)
					{
						group.length = vertices.length / 3 - group.start;
						if(group.length > 0)
							groups.push(group);
					}

					group = {
						name: "mat_" + mat_id,
						start: vertices.length / 3,
						length: -1,
						material: ""
					};
				}

				var v1 = m.faces[i+1];
				var v2 = m.faces[i+2];
				var v3 = m.faces[i+3];
				var v4 = m.faces[i+4];
				vertices.push( m.vertices[ v1*3 ], m.vertices[ v1*3+1 ], m.vertices[ v1*3+2 ]);
				vertices.push( m.vertices[ v2*3 ], m.vertices[ v2*3+1 ], m.vertices[ v2*3+2 ]);
				vertices.push( m.vertices[ v3*3 ], m.vertices[ v3*3+1 ], m.vertices[ v3*3+2 ]);
				vertices.push( m.vertices[ v1*3 ], m.vertices[ v1*3+1 ], m.vertices[ v1*3+2 ]);
				vertices.push( m.vertices[ v3*3 ], m.vertices[ v3*3+1 ], m.vertices[ v3*3+2 ]);
				vertices.push( m.vertices[ v4*3 ], m.vertices[ v4*3+1 ], m.vertices[ v4*3+2 ]);

				var v1 = m.faces[i+6];
				var v2 = m.faces[i+7];
				var v3 = m.faces[i+8];
				var v4 = m.faces[i+9];
				uvs.push( m.uvs[ v1*2 ], m.uvs[ v1*2+1 ]);
				uvs.push( m.uvs[ v2*2 ], m.uvs[ v2*2+1 ]);
				uvs.push( m.uvs[ v3*2 ], m.uvs[ v3*2+1 ]);
				uvs.push( m.uvs[ v1*2 ], m.uvs[ v1*2+1 ]);
				uvs.push( m.uvs[ v3*2 ], m.uvs[ v3*2+1 ]);
				uvs.push( m.uvs[ v4*2 ], m.uvs[ v4*2+1 ]);

				var v1 = m.faces[i+10];
				var v2 = m.faces[i+11];
				var v3 = m.faces[i+12];
				var v4 = m.faces[i+13];
				normals.push( m.normals[ v1*3 ], m.normals[ v1*3+1 ], m.normals[ v1*3+2 ]);
				normals.push( m.normals[ v2*3 ], m.normals[ v2*3+1 ], m.normals[ v2*3+2 ]);
				normals.push( m.normals[ v3*3 ], m.normals[ v3*3+1 ], m.normals[ v3*3+2 ]);
				normals.push( m.normals[ v1*3 ], m.normals[ v1*3+1 ], m.normals[ v1*3+2 ]);
				normals.push( m.normals[ v3*3 ], m.normals[ v3*3+1 ], m.normals[ v3*3+2 ]);
				normals.push( m.normals[ v4*3 ], m.normals[ v4*3+1 ], m.normals[ v4*3+2 ]);

				i+=14;
			}
			else if(m.faces[i] == 42) //triangle
			{
				//material info
				var mat_id = m.faces[i+4];
				if(current_mat_id < mat_id)
				{
					trace("New mat: " + mat_id );
					current_mat_id = mat_id;
					if(group != null)
					{
						group.length = vertices.length / 3 - group.start;
						if(group.length > 0)
							groups.push(group);
					}

					group = {
						name: "mat_" + mat_id,
						start: vertices.length / 3,
						length: -1,
						material: ""
					};
				}

				var v1 = m.faces[i+1];
				var v2 = m.faces[i+2];
				var v3 = m.faces[i+3];
				vertices.push( m.vertices[ v1*3 ], m.vertices[ v1*3+1 ], m.vertices[ v1*3+2 ]);
				vertices.push( m.vertices[ v2*3 ], m.vertices[ v2*3+1 ], m.vertices[ v2*3+2 ]);
				vertices.push( m.vertices[ v3*3 ], m.vertices[ v3*3+1 ], m.vertices[ v3*3+2 ]);

				var v1 = m.faces[i+5];
				var v2 = m.faces[i+6];
				var v3 = m.faces[i+7];
				uvs.push( m.uvs[ v1*2 ], m.uvs[ v1*2+1 ]);
				uvs.push( m.uvs[ v2*2 ], m.uvs[ v2*2+1 ]);
				uvs.push( m.uvs[ v3*2 ], m.uvs[ v3*2+1 ]);

				var v1 = m.faces[i+8];
				var v2 = m.faces[i+9];
				var v3 = m.faces[i+10];
				normals.push( m.normals[ v1*3 ], m.normals[ v1*3+1 ], m.normals[ v1*3+2 ]);
				normals.push( m.normals[ v2*3 ], m.normals[ v2*3+1 ], m.normals[ v2*3+2 ]);
				normals.push( m.normals[ v3*3 ], m.normals[ v3*3+1 ], m.normals[ v3*3+2 ]);

				i += 11;
			}
			else 
			{
				trace("Warning: unsupported primitive type: " + m.faces[i]);
				i += 1;
			}
		}

		if(group && (vertices.length - group.start) > 1)
		{
			group.length = vertices.length - group.start;
			groups.push(group);
		}

		var mesh = {};
		mesh.vertices = new Float32Array( vertices );
		if(normals.length > 0)
			mesh.normals = new Float32Array( normals );
		if(uvs.length > 0)
			mesh.coords = new Float32Array( uvs );
		//mesh.coords = new Float32Array( m.uvs );
		//if(m.faces) mesh.triangles = new Uint16Array( m.faces );

		//extra info
		mesh.bounding = LS.Formats.computeMeshBounding(mesh.vertices);
		mesh.info = {};
		if(groups.length > 1)
			mesh.info.groups = groups;

		trace("Num vertex: " + vertices.length / 3);
		trace(mesh.info.groups);

		return mesh;
	}
};

LS.Formats.registerParser( parserCGArtMesh );




//GR2
var parserGR2 = { 
	extension: 'gr2',
	type: 'mesh',
	format: 'text',
	dataType:'string',

	parse: function(data, options)
	{
		data = data.replace(/\'/g,'\"');
		trace(data);
		data = JSON.parse("["+data+"]");
		window.foo = data;
		data = data[0];
		var mesh = {
		  vertices: data[0][2][0],
		  normals: data[0][2][1],
		  triangles: data[0][3]
		};
		mesh.bounding = LS.Formats.computeMeshBounding(mesh.vertices);
		return mesh;
	}
};

LS.Formats.registerParser( parserGR2 );



/**
* The SceneTree contains all the info about the Scene and nodes
*
* @class SceneTree
* @constructor
*/

function SceneTree()
{
	this.uid = LS.generateUId("TREE-");

	this._root = new LS.SceneNode("root");
	this._root.removeAllComponents();
	this._root._is_root  = true;
	this._root._in_tree = this;
	this._nodes = [ this._root ];
	this._nodes_by_name = {"root":this._root};
	this._nodes_by_uid = {};
	this._nodes_by_uid[ this._root.uid ] = this._root;

	this.external_scripts = []; //external scripts that must be loaded before initializing the scene (mostly libraries used by this scene)
	this.global_scripts = []; //scripts that are located in the resources folder and must be loaded before launching the app
	this.preloaded_resources = {}; //resources that must be loaded, appart from the ones in the components

	//FEATURES NOT YET FULLY IMPLEMENTED
	this._paths = []; //FUTURE FEATURE: to store splines I think
	this._local_resources = {}; //used to store resources that go with the scene
	this.animation = null;

	this.layer_names = ["main","secondary"];

	LEvent.bind( this, "treeItemAdded", this.onNodeAdded, this );
	LEvent.bind( this, "treeItemRemoved", this.onNodeRemoved, this );

	this.init();
}

LS.extendClass( SceneTree, ComponentContainer ); //scene could also have components

Object.defineProperty( SceneTree.prototype, "root", {
	enumerable: true,
	get: function() {
		return this._root;
	},
	set: function(v) {
		throw("Root node cannot be replaced");
	}
});

Object.defineProperty( SceneTree.prototype, "time", {
	enumerable: true,
	get: function() {
		return this._time;
	},
	set: function(v) {
		throw("Cannot set time directly");
	}
});

Object.defineProperty( SceneTree.prototype, "globalTime", {
	enumerable: true,
	get: function() {
		return this._global_time;
	},
	set: function(v) {
		throw("Cannot set global_time directly");
	}
});

//Some useful events
SceneTree.supported_events = ["start","update","finish","clear","beforeReload","change","afterRender","configure","nodeAdded","nodeChangeParent","nodeComponentRemoved","reload","renderPicking","scene_loaded","serialize"];

//methods

/**
* This initializes the content of the scene.
* Call it to clear the scene content
*
* @method init
* @return {Boolean} Returns true on success
*/
SceneTree.prototype.init = function()
{
	this.id = "";
	//this.materials = {}; //shared materials cache: moved to LS.RM.resources
	this.local_repository = null;
	this.global_scripts = [];
	this.external_scripts = [];
	this.preloaded_resources = {};

	this._root.removeAllComponents();
	this._root.uid = LS.generateUId("NODE-");

	this._nodes = [ this._root ];
	this._nodes_by_name = { "root": this._root };
	this._nodes_by_uid = {};
	this._nodes_by_uid[ this._root.uid ] = this._root;

	//default components
	this.info = new LS.Components.GlobalInfo();
	this._root.addComponent( this.info );
	this._root.addComponent( new LS.Camera() );
	this.current_camera = this._root.camera;
	this._root.addComponent( new LS.Light({ position: vec3.fromValues(100,100,100), target: vec3.fromValues(0,0,0) }) );

	this._frame = 0;
	this._last_collect_frame = -1; //force collect
	this._state = LS.STOPPED;

	this._time = 0;
	this._global_time = 0; //in seconds
	this._start_time = 0; //in seconds
	this._last_dt = 1/60; //in seconds
	this._must_redraw = true;

	if(this.selected_node) 
		delete this.selected_node;

	this.layer_names = ["main","secondary"];
	this.animation = null;
	this._local_resources = {};
	this.extra = {};

	this._renderer = LS.Renderer;
}

/**
* Clears the scene using the init function
* and trigger a "clear" LEvent
*
* @method clear
*/
SceneTree.prototype.clear = function()
{
	//remove all nodes to ensure no lose callbacks are left
	while(this._root._children && this._root._children.length)
		this._root.removeChild(this._root._children[0], false, true ); //recompute_transform, remove_components

	//remove scene components
	this._root.processActionInComponents("onRemovedFromNode",this); //send to components
	this._root.processActionInComponents("onRemovedFromScene",this); //send to components

	this.init();
	/**
	 * Fired when the whole scene is cleared
	 *
	 * @event clear
	 */
	LEvent.trigger(this,"clear");
	LEvent.trigger(this,"change");
}

/**
* Configure the Scene using an object (the object can be obtained from the function serialize)
* Inserts the nodes, configure them, and change the parameters
* Destroys previously existing info
*
* @method configure
* @param {Object} scene_info the object containing all the info about the nodes and config of the scene
*/
SceneTree.prototype.configure = function(scene_info)
{
	this._root.removeAllComponents(); //remove light and camera

	//this._components = [];
	//this.camera = this.light = null; //legacy

	if(scene_info.uid)
		this.uid = scene_info.uid;

	if(scene_info.object_type != "SceneTree")
		console.warn("Warning: object set to scene doesnt look like a propper one.");

	if(scene_info.local_repository)
		this.local_repository = scene_info.local_repository;

	//extra info that the user wanted to save (comments, etc)
	if(scene_info.extra)
		this.extra = scene_info.extra;

	if(scene_info.root)
		this.root.configure( scene_info.root );

	//LEGACY
	if(scene_info.nodes)
		this.root.configure( { children: scene_info.nodes } );

	//parse materials
	/*
	if(scene_info.materials)
		for(var i in scene_info.materials)
			this.materials[ i ] = new Material( scene_info.materials[i] );
	*/

	//LEGACY
	if(scene_info.components)
		this._root.configureComponents(scene_info);

	// LEGACY...
	if(scene_info.camera)
	{
		if(this._root.camera)
			this._root.camera.configure( scene_info.camera );
		else
			this._root.addComponent( new Camera( scene_info.camera ) );
	}

	if(scene_info.light)
	{
		if(this._root.light)
			this._root.light.configure( scene_info.light );
		else
			this._root.addComponent( new Light(scene_info.light) );
	}
	else if(scene_info.hasOwnProperty("light")) //light is null
	{
		//skip default light
		if(this._root.light)
		{
			this._root.removeComponent( this._root.light );
			this._root.light = null;
		}
	}

	//TODO
	/*
	if( scene_info.local_resources )
	{
	}
	*/

	if( scene_info.global_scripts )
		this.global_scripts = scene_info.global_scripts.concat();

	if( scene_info.external_scripts )
		this.external_scripts = scene_info.external_scripts.concat();

	if( scene_info.preloaded_resources )
		this.preloaded_resources = LS.cloneObject( scene_info.preloaded_resources );

	if( scene_info.layer_names )
		this.layer_names = scene_info.layer_names.concat();

	if(scene_info.animation)
		this.animation = new LS.Animation( scene_info.animation );

	if(scene_info.components)
		this.configureComponents( scene_info );

	//if(scene_info.animations)
	//	this._root.animations = scene_info.animations;

	/**
	 * Fired after the scene has been configured
	 * @event configure
	 * @param {Object} scene_info contains all the info to do the configuration
	 */
	LEvent.trigger(this,"configure",scene_info);
	LEvent.trigger(this,"change");
}

/**
* Creates and object containing all the info about the scene and nodes.
* The oposite of configure.
* It calls the serialize method in every node
*
* @method serialize
* @return {Object} return a JS Object with all the scene info
*/

SceneTree.prototype.serialize = function()
{
	var o = {};

	o.uid = this.uid;
	o.object_type = LS.getObjectClassName(this);

	//legacy
	o.local_repository = this.local_repository;

	//o.nodes = [];
	o.extra = this.extra || {};

	//add nodes
	o.root = this.root.serialize();

	if(this.animation)
		o.animation = this.animation.serialize();

	o.layer_names = this.layer_names.concat();
	o.global_scripts = this.global_scripts.concat();
	o.external_scripts = this.external_scripts.concat();
	o.preloaded_resources = LS.cloneObject( this.preloaded_resources );

	this.serializeComponents( o );

	//add shared materials
	/*
	if(this.materials)
	{
		o.materials = {};
		for(var i in this.materials)
			o.materials[ i ] = this.materials[i].serialize();
	}
	*/

	//serialize scene components
	//this.serializeComponents(o);

	/**
	 * Fired after the scene has been serialized to an object
	 * @event serialize
	 * @param {Object} object to store the persistent info
	 */
	LEvent.trigger(this,"serialize",o);

	return o;
}

/**
* Loads a scene from a relative url pointing to a JSON description
* Warning: this url is not passed through the LS.ResourcesManager so the url is absolute
*
* @method load
* @param {String} url where the JSON object containing the scene is stored
* @param {Function}[on_complete=null] the callback to call when the loading is complete
* @param {Function}[on_error=null] the callback to call if there is a  loading error
*/

SceneTree.prototype.load = function(url, on_complete, on_error)
{
	if(!url) return;
	var that = this;
	var nocache = LS.ResourcesManager.getNoCache(true);
	if(nocache)
		url += (url.indexOf("?") == -1 ? "?" : "&") + nocache;

	LS.Network.request({
		url: url,
		dataType: 'json',
		success: inner_json_loaded,
		error: inner_error
	});

	/**
	 * Fired before loading scene
	 * @event beforeLoad
	 */
	LEvent.trigger(this,"beforeLoad");

	function inner_json_loaded( response )
	{
		var scripts = LS.SceneTree.getScriptsList( response );

		//check JSON for special scripts
		if ( scripts.length )
			that.loadScripts( scripts, function(){ inner_success(response); }, on_error );
		else
			inner_success( response );
	}

	function inner_success( response )
	{
		that.init();
		that.configure(response);
		that.loadResources( inner_all_loaded );
		/**
		 * Fired when the scene has been loaded but before the resources
		 * @event load
		 */
		LEvent.trigger(that,"load");
	}

	function inner_all_loaded()
	{
		if(on_complete)
			on_complete(that, url);
		/**
		 * Fired after all resources have been loaded
		 * @event loadCompleted
		 */
		LEvent.trigger(that,"loadCompleted");
	}

	function inner_error(err)
	{
		console.warn("Error loading scene: " + url + " -> " + err);
		if(on_error)
			on_error(url);
	}
}

//returns a list of all the scripts that must be loaded, in order and with the full path
SceneTree.getScriptsList = function( root )
{
	var scripts = [];
	if ( root.external_scripts && root.external_scripts.length )
		scripts = scripts.concat( root.external_scripts );
	if ( root.global_scripts && root.global_scripts.length )
	{
		for(var i in root.global_scripts)
		{
			var script_fullpath = root.global_scripts[i];
			if(!script_fullpath || LS.ResourcesManager.getExtension( script_fullpath ) != "js" )
				continue;
			var script_url = LS.ResourcesManager.getFullURL( script_fullpath );
			scripts.push( script_url );
		}
	}
	return scripts;
}

SceneTree.prototype.loadScripts = function( scripts, on_complete, on_error )
{
	scripts = scripts || LS.SceneTree.getScriptsList( this );
	LS.Network.requestScript( scripts, on_complete, on_error );
}

//used to ensure that components use the right class when the class comes from a global script
SceneTree.prototype.checkComponentsCodeModification = function()
{
	for(var i = 0; i < this._nodes.length; ++i )
	{
		//current components
		var node = this._nodes[i];
		for(var j = 0; j < node._components.length; ++j)
		{
			var compo = node._components[j];
			var class_name = LS.getObjectClassName( compo );
			var current_class = LS.Components[ class_name ];
			if( current_class == compo.constructor )
				continue;
			//replace class instance in-place
			var data = compo.serialize();

			var new_compo = new current_class( data );

			var index = node.getIndexOfComponent( compo );
			node.removeComponent( compo );
			
			node.addComponent( new_compo, index );
			console.log("Class replaced: " + class_name );
		}

		//missing
		if(node._missing_components && node._missing_components.length)
		{
			var still_missing = [];
			for(var j = 0; j < node._missing_components.length; ++j)
			{
				var compo_info = node._missing_components[j];
				var class_name = compo_info[0];
				var current_class = LS.Components[ class_name ];
				if(!current_class)
				{
					still_missing.push(compo_info);
					continue; //still missing
				}
				var new_compo = new current_class( compo_info[1] );
				node.addComponent( new_compo );
				console.log("Missing repaired: " + class_name );
			}
			node._missing_components = still_missing.length ? still_missing : null;
		}
	}
}

SceneTree.prototype.appendScene = function(scene)
{
	//clone: because addNode removes it from scene.nodes array
	var nodes = scene.root.childNodes;

	/*
	//bring materials
	for(var i in scene.materials)
		this.materials[i] = scene.materials[i];
	*/
	
	//add every node one by one
	for(var i in nodes)
	{
		var node = nodes[i];
		var new_node = new LS.SceneNode( node.id );
		this.root.addChild( new_node );
		new_node.configure( node.constructor == LS.SceneNode ? node.serialize() : node  );
	}
}

SceneTree.prototype.getCamera = function()
{
	var camera = this._root.camera;
	if(camera) 
		return camera;

	if(this._cameras && this._cameras.length)
		return this._cameras[0];

	this.collectData(); //slow
	return this._cameras[0];
}

SceneTree.prototype.getLight = function()
{
	return this._root.light;
}

SceneTree.prototype.onNodeAdded = function(e,node)
{
	//remove from old scene
	if(node._in_tree && node._in_tree != this)
		throw("Cannot add a node from other scene, clone it");

	if( node._name && !this._nodes_by_name[ node._name ] )
		this._nodes_by_name[ node._name ] = node;

	/*
	//generate unique id
	if(node.id && node.id != -1)
	{
		if(this._nodes_by_id[node.id] != null)
			node.id = node.id + "_" + (Math.random() * 1000).toFixed(0);
		this._nodes_by_id[node.id] = node;
	}
	*/

	//store by uid
	if(!node.uid || this._nodes_by_uid[ node.uid ])
		node._uid = LS.generateUId("NODE-");
	//if( this._nodes_by_uid[ node.uid ] )
	//	console.warn("There are more than one node with the same UID: ", node.uid );
	this._nodes_by_uid[ node.uid ] = node;

	//store nodes linearly
	this._nodes.push(node);

	//LEvent.trigger(node,"onAddedToScene", this);
	node.processActionInComponents("onAddedToScene",this); //send to components
	/**
	 * Fired when a new node is added to this scene
	 *
	 * @event nodeAdded
	 * @param {LS.SceneNode} node
	 */
	LEvent.trigger(this,"nodeAdded", node);
	LEvent.trigger(this,"change");
}

SceneTree.prototype.onNodeRemoved = function(e,node)
{
	var pos = this._nodes.indexOf(node);
	if(pos == -1) 
		return;

	this._nodes.splice(pos,1);
	if(node._name && this._nodes_by_name[ node._name ] == node )
		delete this._nodes_by_name[ node._name ];
	if(node.uid)
		delete this._nodes_by_uid[ node.uid ];

	//node.processActionInComponents("onRemovedFromNode",node);
	node.processActionInComponents("onRemovedFromScene",this); //send to components

	/**
	 * Fired after a node has been removed
	 *
	 * @event nodeRemoved
	 * @param {LS.SceneNode} node
	 */
	LEvent.trigger(this,"nodeRemoved", node);
	LEvent.trigger(this,"change");
	return true;
}


SceneTree.prototype.getNodes = function()
{
	return this._nodes;
}

/**
* retrieves a Node based on the name, path ( name|childname|etc ) or uid
*
* @method getNode
* @param {String} name node name to search
* @return {Object} the node or null if it didnt find it
*/
SceneTree.prototype.getNode = function( name )
{
	if(name == "")
		return this.root;
	if(!name)
		return null;
	if(name.charAt(0) == LS._uid_prefix)
		return this._nodes_by_uid[ name ];

	// the | char is used to specify a node child of another node
	if( name.indexOf("|") != -1)
	{
		var tokens = name.split("|");
		var node = this.root; //another option could be to start in this._nodes_by_name[ tokens[0] ]
		for(var i = 0; i < tokens.length && node; ++i)
			node = node.getChildByName( tokens[i] );
		return node;
	}

	return this._nodes_by_name[ name ];
}

/**
* retrieves a Node that matches that name. It is fast because they are stored in an object.
* If more than one object has the same name, the first one added to the tree is returned
*
* @method getNodeByName
* @param {String} name name of the node
* @return {Object} the node or null if it didnt find it
*/
SceneTree.prototype.getNodeByName = function( name )
{
	return this._nodes_by_name[ name ];
}

/**
* retrieves a Node based on a given uid. It is fast because they are stored in an object
*
* @method getNodeByUId
* @param {String} uid uid of the node
* @return {Object} the node or null if it didnt find it
*/
SceneTree.prototype.getNodeByUId = function( uid )
{
	return this._nodes_by_uid[ uid ];
}

/**
* retrieves a Node by its index
*
* @method getNodeByIndex
* @param {Number} node index
* @return {Object} returns the node at the 'index' position in the nodes array
*/
SceneTree.prototype.getNodeByIndex = function(index)
{
	return this._nodes[ index ];
}

//for those who are more traditional
SceneTree.prototype.getElementById = SceneTree.prototype.getNode;

/**
* retrieves a node array filtered by the filter function
*
* @method filterNodes
* @param {function} filter a callback function that receives every node and must return true or false
* @return {Array} array containing the nodes that passes the filter
*/
SceneTree.prototype.filterNodes = function( filter )
{
	var r = [];
	for(var i = 0; i < this._nodes.length; ++i)
		if( filter(this._nodes[i]) )
			r.push(this._nodes[i]);
	return r;
}

/**
* searches the component with this uid, it iterates through all the nodes and components (slow)
*
* @method findComponentByUId
* @param {String} uid uid of the node
* @return {Object} component or null
*/
SceneTree.prototype.findComponentByUId = function(uid)
{
	for(var i = 0; i < this._nodes.length; ++i)
	{
		var compo = this._nodes[i].getComponentByUId( uid );
		if(compo)
			return compo;
	}
	return null;
}

/**
* searches the material with this uid, it iterates through all the nodes (slow)
*
* @method findMaterialByUId
* @param {String} uid uid of the material
* @return {Object} Material or null
*/
SceneTree.prototype.findMaterialByUId = function(uid)
{
	if(LS.RM.materials[uid])
		return LS.RM.materials[uid];

	for(var i = 0; i < this._nodes.length; ++i)
	{
		var material = this._nodes[i].getMaterial();
		if(material && material.uid == uid)
			return material;
	}

	return null;
}


/**
* Returns information of a node component property based on the locator of that property
* Locators are in the form of "{NODE_UID}/{COMPONENT_UID}/{property_name}"
*
* @method getPropertyInfo
* @param {String} locator locator of the property
* @return {Object} object with node, component, name, and value
*/
SceneTree.prototype.getPropertyInfo = function( property_uid )
{
	var path = property_uid.split("/");

	if(path[0].substr(0,5) == "@MAT-")
	{
		var material = LS.RM.materials_by_uid[ path[0] ];
		if(!material)
			return null;
		return material.getPropertyInfoFromPath( path.slice(1) );
	}


	var node = this.getNode( path[0] );
	if(!node)
		return null;

	return node.getPropertyInfoFromPath( path.slice(1) );
}

/**
* Returns information of a node component property based on the locator of that property
* Locators are in the form of "{NODE_UID}/{COMPONENT_UID}/{property_name}"
*
* @method getPropertyInfoFromPath
* @param {Array} path
* @return {Object} object with node, component, name, and value
*/
SceneTree.prototype.getPropertyInfoFromPath = function( path )
{
	if(path[0].substr(0,5) == "@MAT-")
	{
		var material = LS.RM.materials_by_uid[ path[0] ];
		if(!material)
			return null;
		return material.getPropertyInfoFromPath( path.slice(1) );
	}

	var node = this.getNode( path[0] );
	if(!node)
		return null;
	return node.getPropertyInfoFromPath( path.slice(1) );
}



/**
* Assigns a value to the property of a component in a node based on the locator of that property
* Locators are in the form of "{NODE_UID}/{COMPONENT_UID}/{property_name}"
*
* @method setPropertyValue
* @param {String} locator locator of the property
* @param {*} value the value to assign
* @param {SceneNode} root [Optional] if you want to limit the locator to search inside a node
* @return {Component} the target where the action was performed
*/
SceneTree.prototype.setPropertyValue = function( locator, value, root_node )
{
	var path = locator.split("/");
	this.setPropertyValueFromPath( path, value, root_node, 0 );
}

/**
* Assigns a value to the property of a component in a node based on the locator that property
* Locators are in the form of "{NODE_UID}/{COMPONENT_UID}/{property_name}"
*
* @method setPropertyValueFromPath
* @param {Array} path a property locator split by "/"
* @param {*} value the value to assign
* @param {SceneNode} root_node [optional] the root node where you want to search the locator (this is to limit the locator to a branch of the scene tree)
* @param {Number} offset [optional] used to avoir generating garbage, instead of slicing the array every time, we pass the array index
* @return {Component} the target where the action was performed
*/
SceneTree.prototype.setPropertyValueFromPath = function( path, value, root_node, offset )
{
	offset = offset || 0;
	if(path.length < (offset+1))
		return;

	if(path[offset].substr(0,5) == "@MAT-")
	{
		var material = LS.RM.materials_by_uid[ path[offset] ];
		if(!material)
			return null;
		return material.setPropertyValueFromPath( path, value, offset + 1 );
	}

	//get node
	var node = root_node ? root_node.findNode( path[offset] ) : this.getNode( path[offset] );
	if(!node)
		return null;

	return node.setPropertyValueFromPath( path, value, offset + 1 );
}


/**
* Returns the resources used by the scene
* includes the nodes, components and preloads
*
* @method getResources
* @param {Object} resources [optional] object with resources
*/
SceneTree.prototype.getResources = function( resources )
{
	resources = resources || {};

	//scene resources
	for(var i in this.textures)
		if(this.textures[i])
			resources[ this.textures[i] ] = GL.Texture;

	//resources that must be preloaded (because they will be used in the future)
	if(this.preloaded_resources)
		for(var i in this.preloaded_resources)
			resources[ i ] = true;

	//resources from nodes
	for(var i in this._nodes)
		this._nodes[i].getResources( resources );

	return resources;
}

/**
* Loads all the resources of all the nodes in this scene
* it sends a signal to every node to get all the resources info
* and load them in bulk using the ResourceManager
*
* @method loadResources
* @param {Function} on_complete called when the load of all the resources is complete
*/
SceneTree.prototype.loadResources = function( on_complete )
{
	var resources = this.getResources();

	//used for scenes with special repository folders
	var options = {};
	if(this.local_repository)
		options.local_repository = this.local_repository;

	//count resources
	var num_resources = 0;
	for(var i in resources)
		++num_resources;

	//load them
	if(num_resources == 0)
	{
		if(on_complete)
			on_complete();
		return;
	}

	LEvent.bind( LS.ResourcesManager, "end_loading_resources", on_loaded );
	LS.ResourcesManager.loadResources( resources );

	function on_loaded()
	{
		LEvent.unbind( LS.ResourcesManager, "end_loading_resources", on_loaded );
		if(on_complete)
			on_complete();
	}
}

/**
* Adds a resource that must be loaded when the scene is loaded
*
* @method addPreloadResource
* @param {String} fullpath the name of the resource
*/
SceneTree.prototype.addPreloadResource = function( fullpath )
{
	this.preloaded_resources[ fullpath ] = true;
}

/**
* Remove a resource from the list of resources to preload
*
* @method removePreloadResource
* @param {String} fullpath the name of the resource
*/
SceneTree.prototype.removePreloadResource = function( fullpath )
{
	delete this.preloaded_resources[ fullpath ];
}


/**
* start the scene (triggers an "start" event)
*
* @method start
* @param {Number} dt delta time
*/
SceneTree.prototype.start = function()
{
	if(this._state == LS.RUNNING)
		return;

	this._state = LS.RUNNING;
	this._start_time = getTime() * 0.001;
	/**
	 * Fired when the scene is starting to play
	 *
	 * @event start
	 * @param {LS.SceneTree} scene
	 */
	LEvent.trigger(this,"start",this);
	this.triggerInNodes("start");
}

/**
* stop the scene (triggers an "finish" event)
*
* @method finish
* @param {Number} dt delta time
*/
SceneTree.prototype.finish = function()
{
	if(this._state == LS.STOPPED)
		return;

	this._state = LS.STOPPED;
	/**
	 * Fired when the scene stops playing
	 *
	 * @event finish
	 * @param {LS.SceneTree} scene
	 */
	LEvent.trigger(this,"finish",this);
	this.triggerInNodes("finish");
	this.purgeResidualEvents();
}


/**
* renders the scene using the assigned renderer
*
* @method render
*/
SceneTree.prototype.render = function(options)
{
	this._renderer.render(this, options);
}

/**
* This methods crawls the whole tree and collects all the useful info (cameras, lights, render instances, colliders, etc)
* Mostly rendering stuff but also some collision info.
* @method collectData
*/
SceneTree.prototype.collectData = function()
{
	//var nodes = scene.nodes;
	var nodes = this.getNodes();
	var instances = [];
	var lights = [];
	var cameras = [];
	var colliders = [];

	//collect render instances, lights and cameras
	for(var i = 0, l = nodes.length; i < l; ++i)
	{
		var node = nodes[i];

		if(node.flags.visible == false) //skip invisibles
			continue;

		//trigger event 
		LEvent.trigger(node, "computeVisibility"); //, {camera: camera} options: options }

		//compute global matrix
		if(node.transform)
			node.transform.updateGlobalMatrix();

		//special node deformers (done here because they are shared for every node)
			//this should be moved to Renderer but not a clean way to do it
			var node_query = new ShaderQuery();
			LEvent.trigger( node, "computingShaderQuery", node_query );

			var node_uniforms = {};
			LEvent.trigger(node, "computingShaderUniforms", node_uniforms );

		//store info
		node._query = node_query;
		node._uniforms = node_uniforms;
		if(!node._instances)
			node._instances = [];
		else
			node._instances.length = 0;

		//get render instances: remember, triggers only support one parameter
		LEvent.trigger(node,"collectRenderInstances", node._instances );
		LEvent.trigger(node,"collectPhysicInstances", colliders );
		LEvent.trigger(node,"collectLights", lights );
		LEvent.trigger(node,"collectCameras", cameras );

		instances = instances.concat( node._instances );
	}

	//we also collect from the scene itself just in case (TODO: REMOVE THIS)
	LEvent.trigger(this, "collectRenderInstances", instances );
	LEvent.trigger(this, "collectPhysicInstances", colliders );
	LEvent.trigger(this, "collectLights", lights );
	LEvent.trigger(this, "collectCameras", cameras );

	//for each camera
	/*
	for(var i = 0, l = cameras.length; i < l; ++i)
	{
		var camera = cameras[i];
	}
	*/
	
	//for each render instance collected
	for(var i = 0, l = instances.length; i < l; ++i)
	{
		var instance = instances[i];
		//compute the axis aligned bounding box
		if(!(instance.flags & RI_IGNORE_FRUSTUM))
			instance.updateAABB();
	}

	//for each physics instance collected
	for(var i = 0, l = colliders.length; i < l; ++i)
	{
		var collider = colliders[i];
		collider.updateAABB();
	}

	this._instances = instances;
	this._lights = lights;
	this._cameras = cameras;
	this._colliders = colliders;

	//remember when was last time I collected to avoid repeating it
	this._last_collect_frame = this._frame;
}

//instead of recollect everything, we can reuse the info from previous frame, but objects need to be updated
SceneTree.prototype.updateCollectedData = function()
{
	var nodes = this._nodes;
	var instances = this._instances;
	var lights = this._lights;
	var cameras = this._cameras;
	var colliders = this._colliders;

	//update matrices
	for(var i = 0, l = nodes.length; i < l; ++i)
		if(nodes[i].transform)
			nodes[i].transform.updateGlobalMatrix();
	
	//render instances: just update them
	for(var i = 0, l = instances.length; i < l; ++i)
	{
		var instance = instances[i];
		if(instance.flags & RI_IGNORE_AUTOUPDATE)
			instance.update();
		//compute the axis aligned bounding box
		if(!(instance.flags & RI_IGNORE_FRUSTUM))
			instance.updateAABB();
	}

	//lights
	for(var i = 0, l = lights.length; i < l; ++i)
	{
	}

	//cameras
	for(var i = 0, l = cameras.length; i < l; ++i)
	{
	}

	//colliders
	for(var i = 0, l = colliders.length; i < l; ++i)
	{
		var collider = colliders[i];
		collider.updateAABB();
	}
}

SceneTree.prototype.update = function(dt)
{
	/**
	 * Fired before doing an update
	 *
	 * @event beforeUpdate
	 * @param {LS.SceneTree} scene
	 */
	LEvent.trigger(this,"beforeUpdate", this);

	this._global_time = getTime() * 0.001;
	this._time = this._global_time - this._start_time;
	this._last_dt = dt;

	/**
	 * Fired while updating
	 *
	 * @event update
	 * @param {number} dt
	 */
	LEvent.trigger(this,"update", dt);
	this.triggerInNodes("update",dt, true);

	/**
	 * Fired after updating the scene
	 *
	 * @event afterUpdate
	 */
	LEvent.trigger(this,"afterUpdate", this);
}

/**
* triggers an event to all nodes in the scene
*
* @method triggerInNodes
* @param {String} event_type event type name
* @param {Object} data data to send associated to the event
*/

SceneTree.prototype.triggerInNodes = function(event_type, data)
{
	LEvent.triggerArray( this._nodes, event_type, data);
}


SceneTree.prototype.generateUniqueNodeName = function(prefix)
{
	prefix = prefix || "node";
	var i = 1;

	var pos = prefix.lastIndexOf("_");
	if(pos)
	{
		var n = prefix.substr(pos+1);
		if( parseInt(n) )
		{
			i = parseInt(n);
			prefix = prefix.substr(0,pos);
		}
	}

	var node_name = prefix + "_" + i;
	while( this.getNode(node_name) != null )
		node_name = prefix + "_" + (i++);
	return node_name;
}


SceneTree.prototype.refresh = function()
{
	this._must_redraw = true;
}


SceneTree.prototype.getTime = function()
{
	return this._time;
}

//This is ugly but sometimes if scripts fail there is a change the could get hooked to the scene forever
//so this way we remove any event that belongs to a component thats doesnt belong to this scene tree
SceneTree.prototype.purgeResidualEvents = function()
{
	if(!this.__events)
		return;

	//crawl all 
	for(var i in this.__events)
	{
		var event = this.__events[i];
		if(!event)
			continue;
		var to_keep = [];
		for(var j = 0; j < event.length; ++j)
		{
			var inst = event[j][1];
			if(inst && LS.isClassComponent( inst.constructor ) )
			{
				//no attached node or node not attached to any scene
				if(!inst._root || inst._root.scene !== this )
				{
					console.warn("Event attached to the Scene belongs to a removed node, purged. Event:",i,"Class:", LS.getObjectClassName( inst ) );
					continue; //skip keeping it, so it will no longer exist
				}
			}
			to_keep.push(event[j]);
		}
		this.__events[i] = to_keep;
	}
}

SceneTree.prototype.getLayerNames = function(v)
{
	var r = [];

	for(var i = 0; i < 32; ++i)
	{
		if( v === undefined || v & (1<<i) )
			r.push( this.layer_names[i] || ("layer"+i) );
	}
	return r;
}

SceneTree.prototype.findNodeComponents = function( type )
{
	if(!type)
		return;

	var find_component = null;
	if(type.constructor === String)
		find_component = LS.Components[ type ];
	else
		find_component = type;
	if(!find_component)
		return;

	var result = [];
	var nodes = LS.GlobalScene._nodes;
	for(var i = 0; i < nodes.length; ++i)
	{
		var node = nodes[i];
		var components = node._components;
		for(var j = 0; j < components.length; ++j)
			if( components[j].constructor === find_component )
				result.push( components[j] );
	}
	return result;
}

LS.SceneTree = SceneTree;
LS.Classes.SceneTree = SceneTree;


//****************************************************************************

/**
* The SceneNode class represents and object in the scene
* Is the base class for all objects in the scene as meshes, lights, cameras, and so
*
* @class SceneNode
* @param {String} name the name for this node (otherwise a random one is computed)
* @constructor
*/

function SceneNode( name )
{
	if(name && name.constructor !== String)
	{
		name = null;
		console.warn("SceneNode cosntructor first parameter must be a String with the name");
	}

	//Generic
	this._name = name || ("node_" + (Math.random() * 10000).toFixed(0)); //generate random number
	this._uid = LS.generateUId("NODE-");
	this._classList = {}; //to store classes
	this.layers = 3|0; //32 bits for layers (force to int)
	this.node_type = null; //used to store a string defining the node info

	this._components = []; //used for logic actions
	this._missing_components = null;

	this._prefab = null;
	this._parentNode = null;
	this._children = null;

	this.init(false,true);
}

SceneNode.prototype.init = function( keep_components, keep_info )
{
	if(!keep_info)
	{
		this.layers = 3|0; //32 bits for layers (force to int)
		this._name = name || ("node_" + (Math.random() * 10000).toFixed(0)); //generate random number
		this._uid = LS.generateUId("NODE-");
		this._classList = {};
	}

	this.node_type = null;

	//flags
	this.flags = {
		visible: true,
		selectable: true,
		two_sided: false,
		flip_normals: false,
		cast_shadows: true,
		receive_shadows: true,
		ignore_lights: false, //not_affected_by_lights
		alpha_test: false,
		alpha_shadows: false,
		depth_test: true,
		depth_write: true
	};

	//Basic components
	if(!keep_components)
	{
		if( this._components && this._components.length )
			console.warn("SceneNode.init() should not be called if it contains components, call clear instead");
		this._components = []; //used for logic actions
		this._missing_components = null;
		this.addComponent( new LS.Transform() );
	}

	//material
	this._material = null;
	this.extra = {}; //for extra info
}

//get methods from other classes
LS.extendClass( SceneNode, ComponentContainer ); //container methods
LS.extendClass( SceneNode, CompositePattern ); //container methods

/**
* changes the node name
* @method setName
* @param {String} new_name the new name
* @return {Object} returns true if the name changed
*/

Object.defineProperty( SceneNode.prototype, 'name', {
	set: function(name)
	{
		this.setName( name );
	},
	get: function(){
		return this._name;
	},
	enumerable: true
});

Object.defineProperty( SceneNode.prototype, 'fullname', {
	set: function(name)
	{
		throw("You cannot set fullname, it depends on the parent nodes");
	},
	get: function(){
		return this.getPathName();
	},
	enumerable: false
});

//Changing the UID  has lots of effects (because nodes are indexed by UID in the scene)
//If you want to catch the event of the uid_change, remember, the previous uid is stored in LS.SceneNode._last_uid_changed (it is not passed in the event)
Object.defineProperty( SceneNode.prototype, 'uid', {
	set: function(uid)
	{
		if(!uid)
			return;

		//valid uid?
		if(uid[0] != LS._uid_prefix)
		{
			console.warn("Invalid UID, renaming it to: " + uid );
			uid = LS._uid_prefix + uid;
		}

		//no changes?
		if(uid == this._uid)
			return;

		SceneNode._last_uid_changed = this._uid; //hack, in case we want the previous uid of a node 

		//update scene tree indexing
		if( this._in_tree && this._in_tree._nodes_by_uid[ this.uid ] )
			delete this._in_tree._nodes_by_uid[ this.uid ];
		this._uid = uid;
		if( this._in_tree )
			this._in_tree._nodes_by_uid[ this.uid ] = this;
		//events
		LEvent.trigger( this, "uid_changed", uid );
		if(this._in_tree)
			LEvent.trigger( this._in_tree, "node_uid_changed", this );
	},
	get: function(){
		return this._uid;
	},
	enumerable: true
});


Object.defineProperty( SceneNode.prototype, 'visible', {
	set: function(v)
	{
		this.flags.visible = v;
	},
	get: function(){
		return this.flags.visible;
	},
	enumerable: true
});

Object.defineProperty( SceneNode.prototype, 'material', {
	set: function(v)
	{
		this._material = v;
		if(!v)
			return;
		if(v.constructor === String)
			return;
		if(v._root && v._root != this) //has root and its not me
			console.warn( "Cannot assign a material of one SceneNode to another, you must clone it or register it" )
		else
			v._root = this; //link
	},
	get: function(){
		return this._material;
	},
	enumerable: true
});

Object.defineProperty( SceneNode.prototype, 'prefab', {
	set: function(name)
	{
		this._prefab = name;
		var prefab = LS.RM.getResource(name);
		if(prefab)
			this.reloadFromPrefab();
	},
	get: function(){
		return this._prefab;
	},
	enumerable: true
});

SceneNode.prototype.clear = function()
{
	this.removeAllComponents();
	this.removeAllChildren();
	this.init();
}

SceneNode.prototype.setName = function(new_name)
{
	if(this._name == new_name) 
		return true; //no changes

	//check that the name is valid (doesnt have invalid characters)
	if(!LS.validateName(new_name))
		return false;

	var scene = this._in_tree;
	if(!scene)
	{
		this._name = new_name;
		return true;
	}

	//remove old link
	if( this._name )
		delete scene._nodes_by_name[ this._name ];

	//assign name
	this._name = new_name;

	//we already have another node with this name
	if( new_name && !scene._nodes_by_name[ new_name ] )
		scene._nodes_by_name[ this._name ] = this;

	/**
	 * Node changed name
	 *
	 * @event name_changed
	 * @param {String} new_name
	 */
	LEvent.trigger( this, "name_changed", new_name );
	if(scene)
		LEvent.trigger( scene, "node_name_changed", this );
	return true;
}

Object.defineProperty( SceneNode.prototype, 'classList', {
	get: function() { return this._classList },
	set: function(v) {},
	enumerable: false
});

/**
* @property className {String}
*/
Object.defineProperty( SceneNode.prototype, 'className', {
	get: function() {
			var keys = null;
			if(Object.keys)
				keys = Object.keys(this._classList); 
			else
			{
				keys = [];
				for(var k in this._classList)
					keys.push(k);
			}
			return keys.join(" ");
		},
	set: function(v) { 
		this._classList = {};
		if(!v)
			return;
		var t = v.split(" ");
		for(var i in t)
			this._classList[ t[i] ] = true;
	},
	enumerable: true
});

SceneNode.prototype.getLocator = function()
{
	return this.uid;
}

SceneNode.prototype.getPropertyInfo = function( locator )
{
	var path = locator.split("/");
	return this.getPropertyInfoFromPath(path);
}

SceneNode.prototype.getPropertyInfoFromPath = function( path )
{
	var target = this;
	var varname = path[0];

	if(path.length == 0)
	{
		return {
			node: this,
			target: null,
			name: "",
			value: this,
			type: "node"
		};
	}
    else if(path.length == 1) //compo or //var
	{
		if(path[0][0] == "@")
		{
			target = this.getComponentByUId( path[0] );
			return {
				node: this,
				target: target,
				name: target ? LS.getObjectClassName( target ) : "",
				type: "component",
				value: target
			};
		}
		else if (path[0] == "material")
		{
			target = this.getMaterial();
			return {
				node: this,
				target: target,
				name: target ? LS.getObjectClassName( target ) : "",
				type: "material",
				value: target
			};
		}

		var target = this.getComponent( path[0] );
		if(target)
		{
			return {
				node: this,
				target: target,
				name: target ? LS.getObjectClassName( target ) : "",
				type: "component",
				value: target
			};
		}

		switch(path[0])
		{
			case "matrix":
			case "x":
			case "y": 
			case "z": 
			case "position":
			case "rotX":
			case "rotY":
			case "rotZ":
				target = this.transform;
				varname = path[0];
				break;
			default: 
				target = this;
				varname = path[0];
			break;
		}
	}
    else if(path.length > 1) //compo/var
	{
		if(path[0][0] == "@")
		{
			varname = path[1];
			target = this.getComponentByUId( path[0] );
		}
		else if (path[0] == "material")
		{
			target = this.getMaterial();
			varname = path[1];
		}
		else if (path[0] == "flags")
		{
			target = this.flags;
			varname = path[1];
		}
		else
		{
			target = this.getComponent( path[0] );
			varname = path[1];
		}

		if(!target)
			return null;
	}
	else //¿?
	{
	}

	var v = undefined;

	if( target.getPropertyInfoFromPath && target != this )
	{
		var r = target.getPropertyInfoFromPath( path.slice(1) );
		if(r)
			return r;
	}

	if( target.getPropertyValue )
		v = target.getPropertyValue( varname );

	if(v === undefined && target[ varname ] === undefined)
		return null;

	var value = v !== undefined ? v : target[ varname ];

	var extra_info = target.constructor[ "@" + varname ];
	var type = "";
	if(extra_info)
		type = extra_info.type;
	if(!type && value !== null && value !== undefined)
	{
		if(value.constructor === String)
			type = "string";
		else if(value.constructor === Boolean)
			type = "boolean";
		else if(value.length)
			type = "vec" + value.length;
		else if(value.constructor === Number)
			type = "number";
	}

	return {
		node: this,
		target: target,
		name: varname,
		value: value,
		type: type
	};
}

SceneNode.prototype.setPropertyValue = function( locator, value )
{
	var path = locator.split("/");
	return this.setPropertyValueFromPath(path, value, 0);
}

SceneNode.prototype.setPropertyValueFromPath = function( path, value, offset )
{
	offset = offset || 0;

	var target = null;
	var varname = path[offset];

	if(path.length > (offset+1))
	{
		if(path[offset][0] == "@")
		{
			varname = path[offset+1];
			target = this.getComponentByUId( path[offset] );
		}
		else if( path[offset] == "material" )
		{
			target = this.getMaterial();
			varname = path[offset+1];
		}
		else if( path[offset] == "flags" )
		{
			target = this.flags;
			varname = path[offset+1];
		}
		else 
		{
			target = this.getComponent( path[offset] );
			varname = path[offset+1];
		}

		if(!target)
			return null;
	}
	else { //special cases 
		switch ( path[offset] )
		{
			case "matrix": target = this.transform; break;
			case "x":
			case "y":
			case "z":
			case "xrotation": 
			case "yrotation": 
			case "zrotation": 
				target = this.transform; 
				varname = path[offset];
				break;
			case "translate.X": target = this.transform; varname = "x"; break;
			case "translate.Y": target = this.transform; varname = "y"; break;
			case "translate.Z": target = this.transform; varname = "z"; break;
			case "rotateX.ANGLE": target = this.transform; varname = "pitch"; break;
			case "rotateY.ANGLE": target = this.transform; varname = "yaw"; break;
			case "rotateZ.ANGLE": target = this.transform; varname = "roll"; break;
			default: target = this; //null
		}
	}

	if(!target)
		return null;

	if(target.setPropertyValueFromPath && target != this)
		if( target.setPropertyValueFromPath( path, value, offset+1 ) === true )
			return target;
	
	if(target.setPropertyValue  && target != this)
		if( target.setPropertyValue( varname, value ) === true )
			return target;

	if( target[ varname ] === undefined )
		return;

	//disabled because if the vars has a setter it wont be called using the array.set
	//if( target[ varname ] !== null && target[ varname ].set )
	//	target[ varname ].set( value );
	//else
		target[ varname ] = value;

	return target;
}

SceneNode.prototype.getResources = function(res, include_children)
{
	//resources in components
	for(var i in this._components)
		if( this._components[i].getResources )
			this._components[i].getResources( res );

	//res in material
	if(this.material)
	{
		if(typeof(this.material) == "string")
		{
			if(this.material[0] != ":") //not a local material, then its a reference
			{
				res[this.material] = LS.Material;
			}
		}
		else //get the material to get the resources
		{
			var mat = this.getMaterial();
			if(mat)
				mat.getResources( res );
		}
	}

	//prefab
	if(this.prefab)
		res[ this.prefab ] = LS.Prefab;

	//propagate
	if(include_children)
		for(var i in this._children)
			this._children[i].getResources(res, true);

	return res;
}

SceneNode.prototype.getTransform = function() {
	return this.transform;
}

//Helpers

SceneNode.prototype.getMesh = function() {
	var mesh = this.mesh;
	if(!mesh && this.meshrenderer)
		mesh = this.meshrenderer.mesh;
	if(!mesh) return null;
	if(mesh.constructor === String)
		return ResourcesManager.meshes[mesh];
	return mesh;
}

//Light component
SceneNode.prototype.getLight = function() {
	return this.light;
}

//Camera component
SceneNode.prototype.getCamera = function() {
	return this.camera;
}

SceneNode.prototype.getLODMesh = function() {
	var mesh = this.lod_mesh;
	if(!mesh && this.meshrenderer)
		mesh = this.meshrenderer.lod_mesh;
	if(!mesh) return null;
	if(mesh.constructor === String)
		return ResourcesManager.meshes[mesh];
	return mesh;
}

SceneNode.prototype.setMesh = function(mesh_name, submesh_id)
{
	if(this.meshrenderer)
	{
		if(typeof(mesh_name) == "string")
			this.meshrenderer.configure({ mesh: mesh_name, submesh_id: submesh_id });
		else
			this.meshrenderer.mesh = mesh_name;
	}
	else
		this.addComponent( new LS.MeshRenderer({ mesh: mesh_name, submesh_id: submesh_id }) );
}

SceneNode.prototype.loadAndSetMesh = function(mesh_filename, options)
{
	options = options || {};

	if( LS.ResourcesManager.meshes[mesh_filename] || !mesh_filename )
	{
		this.setMesh( mesh_filename );
		if(options.on_complete) options.on_complete( LS.ResourcesManager.meshes[mesh_filename] ,this);
		return;
	}

	var that = this;
	var loaded = LS.ResourcesManager.load(mesh_filename, options, function(mesh){
		that.setMesh(mesh.filename);
		that.loading -= 1;
		if(that.loading == 0)
		{
			LEvent.trigger(that,"resource_loaded",that);
			delete that.loading;
		}
		if(options.on_complete)
			options.on_complete(mesh,that);
	});

	if(!loaded)
	{
		if(!this.loading)
		{
			this.loading = 1;

			LEvent.trigger(this,"resource_loading");
		}
		else
			this.loading += 1;
	}
}

SceneNode.prototype.getMaterial = function()
{
	if (!this.material)
		return null;
	if(this.material.constructor === String)
	{
		if( !this._in_tree )
			return null;
		if( this.material[0] == "@" )//uid
			return LS.ResourcesManager.materials_by_uid[ this.material ];
		return LS.ResourcesManager.materials[ this.material ];
	}
	return this.material;
}

//Apply prefab info (skipping the root components) to node
//It is called from prefab.applyToNodes when a prefab is loaded in memory
SceneNode.prototype.reloadFromPrefab = function()
{
	if(!this.prefab)
		return;

	var prefab = LS.ResourcesManager.resources[ this.prefab ];
	if(!prefab)
		return;

	//apply info
	this.removeAllChildren();
	this.init( true, true );
	//remove all but children info (prefabs overwrite only children info)
	var prefab_data = { children: prefab.prefab_data.children };
	//uid data is already removed from the prefab
	this.configure( prefab_data );

	//load secondary resources 
	var resources = this.getResources( {}, true );
	LS.ResourcesManager.loadResources( resources );
}


/**
* Assigns this node to one layer
* @method setLayer
* @param {number} num layer number
* @param {boolean} value 
*/
SceneNode.prototype.setLayer = function(num, value)
{
	var f = 1<<num;
	this.layers = (this.layers & (~f));
	if(value)
		this.layers |= f;
}

SceneNode.prototype.isInLayer = function(num)
{
	return (this.layers & (1<<num)) !== 0;
}

SceneNode.prototype.getLayers = function()
{
	var r = [];
	if(!this.scene)
		return r;

	for(var i = 0; i < 32; ++i)
	{
		if( this.layers & (1<<i) )
			r.push( this.scene.layer_names[i] || ("layer"+i) );
	}
	return r;
}


SceneNode.prototype.insidePrefab = function()
{
	var aux = this;
	while( aux )
	{
		if(aux.prefab)
			return aux.prefab;
		aux = aux._parentNode;
	}
	return null;
}

/**
* remember clones this node and returns the new copy (you need to add it to the scene to see it)
* @method clone
* @return {Object} returns a cloned version of this node
*/

SceneNode.prototype.clone = function()
{
	var scene = this._in_tree;

	var new_name = scene ? scene.generateUniqueNodeName( this._name ) : this._name ;
	var newnode = new LS.SceneNode( new_name );
	var info = this.serialize();

	//remove all uids from nodes and components
	LS.clearUIds( info );

	info.uid = LS.generateUId("NODE-");
	newnode.configure( info );

	return newnode;
}

/**
* Configure this node from an object containing the info
* @method configure
* @param {Object} info the object with all the info (comes from the serialize method)
*/
SceneNode.prototype.configure = function(info)
{
	//identifiers parsing
	if (info.name)
		this.setName(info.name);
	else if (info.id)
		this.setName(info.id);
	if(info.layers !== undefined)
		this.layers = info.layers;

	if (info.uid)
		this.uid = info.uid;

	if (info.className && info.className.constructor == String)	
		this.className = info.className;

	if(info.node_type)
	{
		this.node_type = info.node_type;
		if(info.node_type == "JOINT")
			this._is_bone = true;
	}

	//TO DO: Change this to more generic stuff
	//some helpers (mostly for when loading from js object that come from importers
	if(info.mesh)
	{
		var mesh_id = info.mesh;
		var mesh = LS.ResourcesManager.meshes[ mesh_id ];

		if(mesh)
		{
			var mesh_render_config = { mesh: mesh_id };

			if(info.submesh_id !== undefined)
				mesh_render_config.submesh_id = info.submesh_id;
			if(info.morph_targets !== undefined)
				mesh_render_config.morph_targets = info.morph_targets;

			var compo = new LS.Components.MeshRenderer(mesh_render_config);

			//parsed meshes have info about primitive
			if( mesh.primitive === "line_strip" )
			{
				compo.primitive = 3;
				delete mesh.primitive;
			}

			//add MeshRenderer
			this.addComponent( compo );

			//skinning
			if(mesh && mesh.bones)
			{
				compo = new LS.Components.SkinDeformer();
				this.addComponent( compo );
			}

			//morph
			if( mesh && mesh.morph_targets )
			{
				var compo = new LS.Components.MorphDeformer( { morph_targets: mesh.morph_targets } );
				this.addComponent( compo );
			}
		}
		else
		{
			console.warn( "SceneNode mesh not found: " + mesh_id );
		}
	}

	//transform in matrix format could come from importers so we leave it
	if(info.position) 
		this.transform.position = info.position;
	if(info.model) 
		this.transform.fromMatrix( info.model ); 
	if(info.transform) 
		this.transform.configure( info.transform ); 

	//first the no components
	if(info.material)
	{
		var mat_class = info.material.material_class;
		if(!mat_class) 
			mat_class = "Material";
		this.material = typeof(info.material) == "string" ? info.material : new LS.MaterialClasses[mat_class](info.material);
	}

	if(info.flags) //merge
		for(var i in info.flags)
			this.flags[i] = info.flags[i];
	
	//add animation tracks player
	if(info.animations)
	{
		this.animations = info.animations;
		this.addComponent( new LS.Components.PlayAnimation({animation:this.animations}) );
	}

	//extra user info
	if(info.extra)
		this.extra = info.extra;

	if(info.comments)
		this.comments = info.comments;

	//restore components
	if(info.components)
		this.configureComponents(info);

	if(info.prefab) 
		this.prefab = info.prefab; //assign and calls this.reloadFromPrefab();
	else //configure children if it is not a prefab
		this.configureChildren(info);

	LEvent.trigger(this,"configure",info);
}

/**
* Serializes this node by creating an object with all the info
* it contains info about the components too
* @method serialize
* @param {bool} ignore_prefab serializing wont returns children if it is a prefab, if you set this to ignore_prefab it will return all the info
* @return {Object} returns the object with the info
*/
SceneNode.prototype.serialize = function( ignore_prefab )
{
	var o = {};

	if(this._name) 
		o.name = this._name;
	if(this.uid) 
		o.uid = this.uid;
	if(this.className) 
		o.className = this.className;
	o.layers = this.layers;

	//work in progress
	if(this.node_type)
		o.node_type = this.node_type;

	//modules
	if(this.mesh && typeof(this.mesh) == "string") 
		o.mesh = this.mesh; //do not save procedural meshes
	if(this.submesh_id != null) 
		o.submesh_id = this.submesh_id;
	if(this.material) 
		o.material = typeof(this.material) == "string" ? this.material : this.material.serialize();
	if(this.prefab && !ignore_prefab) 
		o.prefab = this.prefab;

	if(this.flags) 
		o.flags = LS.cloneObject(this.flags);

	//extra user info
	if(this.extra) 
		o.extra = this.extra;
	if(this.comments) 
		o.comments = this.comments;

	if(this._children && (!this.prefab || ignore_prefab) )
		o.children = this.serializeChildren();

	//save components
	this.serializeComponents(o);

	//extra serializing info
	LEvent.trigger(this,"serialize",o);

	return o;
}

//used to recompute matrix so when parenting one node it doesnt lose its global transformation
SceneNode.prototype._onChildAdded = function( child_node, recompute_transform )
{
	if(recompute_transform && this.transform)
	{
		var M = child_node.transform.getGlobalMatrix(); //get son transform
		var M_parent = this.transform.getGlobalMatrix(); //parent transform
		mat4.invert(M_parent,M_parent);
		child_node.transform.fromMatrix( mat4.multiply(M_parent,M_parent,M) );
		child_node.transform.getGlobalMatrix(); //refresh
	}
	//link transform
	if(this.transform)
		child_node.transform._parent = this.transform;
}

SceneNode.prototype._onChangeParent = function( future_parent, recompute_transform )
{
	if(recompute_transform && future_parent.transform)
	{
		var M = this.transform.getGlobalMatrix(); //get son transform
		var M_parent = future_parent.transform.getGlobalMatrix(); //parent transform
		mat4.invert(M_parent,M_parent);
		this.transform.fromMatrix( mat4.multiply(M_parent,M_parent,M) );
	}
	//link transform
	if(future_parent.transform)
		this.transform._parent = future_parent.transform;
}

SceneNode.prototype._onChildRemoved = function( node, recompute_transform, remove_components )
{
	if(this.transform)
	{
		//unlink transform
		if(recompute_transform)
		{
			var m = node.transform.getGlobalMatrix();
			node.transform._parent = null;
			node.transform.fromMatrix(m);
		}
		else
			node.transform._parent = null;
	}

	if( remove_components )
		node.removeAllComponents();
}

//Computes the bounding box from the render instance of this node
//doesnt take into account children
SceneNode.prototype.getBoundingBox = function( bbox, only_instances )
{
	bbox = bbox || BBox.create();
	var render_instances = this._instances;
	if(render_instances)
		for(var i = 0; i < render_instances.length; ++i)
		{
			if(i == 0)
				bbox.set( render_instances[i].aabb );
			else
				BBox.merge( bbox, bbox, render_instances[i].aabb );
		}

	if(only_instances)
		return bbox;

	if( (!render_instances || render_instances.length == 0) && this.transform )
		return BBox.fromPoint( this.transform.getGlobalPosition() );

	return bbox;
}

LS.SceneNode = SceneNode;
LS.Classes.SceneNode = SceneNode;

/**
* Player class allows to handle the app context easily without having to glue manually all events
	There is a list of options
	==========================
	- canvas: the canvas where the scene should be rendered, if not specified one will be created
	- container_id: string with container id where to create the canvas, width and height will be those from the container
	- width: the width for the canvas in case it is created without a container_id
	- height: the height for the canvas in case it is created without a container_id
	- resources: string with the path to the resources folder
	- shaders: string with the url to the shaders.xml file
	- proxy: string with the url where the proxy is located (useful to avoid CORS)
	- filesystems: object that contains the virtual file systems info { "VFS":"http://litefileserver.com/" } ...
	- redraw: boolean to force to render the scene constantly (useful for animated scenes)
	- autoresize: boolean to automatically resize the canvas when the window is resized
	- autoplay: boolean to automatically start playing the scene once the load is completed
	- loadingbar: boolean to show a loading bar
	Optional callbacks to attach
	============================
	- onPreDraw: executed before drawing a frame
	- onDraw: executed after drawing a frame
	- onPreUpdate(dt): executed before updating the scene (delta_time as parameter)
	- onUpdate(dt): executed after updating the scene (delta_time as parameter)
	- onMouse(e): when a mouse event is triggered
	- onKey(e): when a key event is triggered
* @namespace LS
* @class Player
* @constructor
* @param {Object} options settings for the webgl context creation
*/
function Player(options)
{
	options = options || {};
	this.options = options;

	if(!options.canvas)
	{
		var container = options.container;
		if(options.container_id)
			container = document.getElementById(options.container_id);

		if(!container)
		{
			console.log("No container specified in LS.Player, using BODY as container");
			container = document.body;
		}

		//create canvas
		var canvas = document.createElement("canvas");
		canvas.width = container.offsetWidth;
		canvas.height = container.offsetHeight;
		if(!canvas.width) canvas.width = options.width || 1;
		if(!canvas.height) canvas.height = options.height || 1;
		container.appendChild(canvas);
		options.canvas = canvas;
	}

	this.debug = false;

	this.gl = GL.create(options); //create or reuse
	this.canvas = this.gl.canvas;
	this.render_settings = new LS.RenderSettings(); //this will be replaced by the scene ones.
	this.scene = LS.GlobalScene;
	this.autoplay = options.autoplay !== undefined ? options.autoplay : true;

	LS.catch_exceptions = true;

	if(options.resources)
		LS.ResourcesManager.setPath( options.resources );
	else
		console.warn("LS: no resources path specified");

	LS.ShadersManager.init( options.shaders || "data/shaders.xml" );
	if(!options.shaders)
		console.warn("LS: no shaders folder specified, using default file.");

	if(options.proxy)
		LS.ResourcesManager.setProxy( options.proxy );
	if(options.filesystems)
	{
		for(var i in options.filesystems)
			LS.ResourcesManager.registerFileSystem( i, options.filesystems[i] );
	}

	if(options.autoresize)
	{
		window.addEventListener("resize", (function(){
			this.canvas.width = canvas.parentNode.offsetWidth;
			this.canvas.height = canvas.parentNode.offsetHeight;
		}).bind(this));
	}

	if(options.loadingbar)
	{
		LEvent.bind( LS.ResourcesManager, "start_loading_resources", (function(e,v){ this.loading_bar = 0.0; }).bind(this) );
		LEvent.bind( LS.ResourcesManager, "loading_resources_progress", (function(e,v){ 
			if( this.loading_bar < v )
				this.loading_bar = v;
		}).bind(this) );
		LEvent.bind( LS.ResourcesManager, "end_loading_resources", (function(e,v){ this.loading_bar = this._total_loading = undefined; }).bind(this) );
	}

	LS.Renderer.init();

	//this will repaint every frame and send events when the mouse clicks objects
	this.force_redraw = options.redraw || false;
	this.state = "playing";

	if( this.gl.ondraw )
		throw("There is already a litegl attached to this context");

	//bind all the events 
	this.gl.ondraw = LS.Player.prototype._ondraw.bind(this);
	this.gl.onupdate = LS.Player.prototype._onupdate.bind(this);
	this.gl.onmousedown = LS.Player.prototype._onmouse.bind(this);
	this.gl.onmousemove = LS.Player.prototype._onmouse.bind(this);
	this.gl.onmouseup = LS.Player.prototype._onmouse.bind(this);
	this.gl.onmousewheel = LS.Player.prototype._onmouse.bind(this);
	this.gl.onkeydown = LS.Player.prototype._onkey.bind(this);
	this.gl.onkeyup = LS.Player.prototype._onkey.bind(this);

	//capture input
	gl.captureMouse(true);
	gl.captureKeys(true);

	//launch render loop
	gl.animate();
}

/**
* Loads an scene and triggers start
* @method loadScene
* @param {String} url url to the JSON file containing all the scene info
* @param {Function} on_complete callback trigged when the scene and the resources are loaded
*/
Player.prototype.loadScene = function(url, on_complete)
{
	var that = this;
	var scene = this.scene;
	scene.load( url, inner_start );

	function inner_start()
	{
		//start playing once loaded the json
		if(that.autoplay)
			that.play();
		console.log("Scene playing");
		if(on_complete)
			on_complete();
	}
}

/**
* loads Scene from object or JSON
* @method setScene
* @param {Object} scene
* @param {Function} on_complete callback trigged when the scene and the resources are loaded
*/
Player.prototype.setScene = function( scene_info, on_complete )
{
	var that = this;
	var scene = this.scene;
	if(typeof(scene_info) == "string")
		scene_info = JSON.parse(scene_info);

	var scripts = LS.SceneTree.getScriptsList( scene_info );

	if( scripts && scripts.length )
	{
		scene.clear();
		scene.loadScripts( scripts, inner_external_ready );
	}
	else
		inner_external_ready();

	function inner_external_ready()
	{
		scene.configure( scene_info );
		scene.loadResources( inner_all_loaded );
	}

	function inner_all_loaded()
	{
		if(that.autoplay)
			that.play();
		scene._must_redraw = true;
		console.log("Scene playing");
		if(on_complete)
			on_complete();
	}
}


Player.prototype.pause = function()
{
	this.state = "paused";
}

Player.prototype.play = function()
{
	if(this.debug)
		console.log("Start");
	this.state = "playing";
	this.scene.start();
}

Player.prototype.stop = function()
{
	this.state = "stopped";
	this.scene.finish();
}

Player.prototype._ondraw = function()
{
	if(this.state != "playing")
		return;

	if(this.onPreDraw)
		this.onPreDraw();

	var scene = this.scene;

	if(scene._must_redraw || this.force_redraw )
	{
		scene.render( scene.info ? scene.info.render_settings : this.render_settings );
	}

	if(this.onDraw)
		this.onDraw();

	if(this.loading_bar !== undefined )
		this.renderLoadingBar();
}

Player.prototype._onupdate = function(dt)
{
	if(this.state != "playing")
		return;

	LS.Tween.update(dt);

	if(this.onPreUpdate)
		this.onPreUpdate(dt);

	this.scene.update(dt);

	if(this.onUpdate)
		this.onUpdate(dt);

}

//input
Player.prototype._onmouse = function(e)
{
	//console.log(e);
	if(this.state != "playing")
		return;

	LEvent.trigger( this.scene, e.eventType, e );

	//hardcoded event handlers in the player
	if(this.onMouse)
		this.onMouse(e);
}

Player.prototype._onkey = function(e)
{
	if(this.state != "playing")
		return;

	//hardcoded event handlers in the player
	if(this.onKey)
	{
		var r = this.onKey(e);
		if(r) return;
	}

	LEvent.trigger( this.scene, e.eventType, e );
}

Player.prototype.renderLoadingBar = function()
{
	if(!window.enableWebGLCanvas)
		return;

	if( gl.canvas.canvas2DtoWebGL_enabled )
		enableWebGLCanvas( gl.canvas );

	gl.start2D();
	var y = 0;//gl.drawingBufferHeight - 6;
	gl.fillStyle = [0,0,0,0.5];
	gl.fillRect( 0, y, gl.drawingBufferWidth, 6);
	gl.fillColor = this.loadingbar_color || [0.9,0.5,1.0,1.0];
	gl.fillRect(0,y,gl.drawingBufferWidth * this.loading_bar,6);
	gl.finish2D();
}

Player.prototype.enableDebug = function()
{
	LS.Script.catch_important_exceptions = false;
	LS.catch_exceptions = false;
}

LS.Player = Player;

/**
* Samples a curve and returns the resulting value 
*
* @class LS
* @method getCurveValueAt
* @param {Array} values 
* @param {number} minx min x value
* @param {number} maxx max x value
* @param {number} defaulty default y value
* @param {number} x the position in the curve to sample
* @return {number}
*/
LS.getCurveValueAt = function(values,minx,maxx,defaulty, x)
{
	if(x < minx || x > maxx)
		return defaulty;

	var last = [ minx, defaulty ];
	var f = 0;
	for(var i = 0; i < values.length; i += 1)
	{
		var v = values[i];
		if(x == v[0]) return v[1];
		if(x < v[0])
		{
			f = (x - last[0]) / (v[0] - last[0]);
			return last[1] * (1-f) + v[1] * f;
		}
		last = v;
	}

	v = [ maxx, defaulty ];
	f = (x - last[0]) / (v[0] - last[0]);
	return last[1] * (1-f) + v[1] * f;
}

/**
* Resamples a full curve in values (useful to upload to GPU array)
*
* @method resampleCurve
* @param {Array} values 
* @param {number} minx min x value
* @param {number} maxx max x value
* @param {number} defaulty default y value
* @param {number} numsamples
* @return {Array}
*/

LS.resampleCurve = function(values,minx,maxx,defaulty, samples)
{
	var result = [];
	result.length = samples;
	var delta = (maxx - minx) / samples;
	for(var i = 0; i < samples; i++)
		result[i] = LS.getCurveValueAt(values,minx,maxx,defaulty, minx + delta * i);
	return result;
}

//work in progress to create a new kind of property called attribute which comes with extra info
//valid options are { type: "number"|"string"|"vec2"|"vec3"|"color"|"Texture"...  , min, max, step }
if( !Object.prototype.hasOwnProperty("defineAttribute") )
{
	Object.defineProperty( Object.prototype, "defineAttribute", {
		value: function( name, value, options ) {
			if(options && typeof(options) == "string")
				options = { type: options };

			var root = this;
			if(typeof(this) != "function")
			{
				this[name] = value;
				root = this.constructor;
			}
			Object.defineProperty( root, "@" + name, {
				value: options || {},
				enumerable: false
			});
		},
		enumerable: false
	});

	Object.defineProperty( Object.prototype, "getAttribute", {
		value: function( name ) {
			var v = "@" + name;
			if(this.hasOwnProperty(v))
				return this[v];
			if(this.constructor && this.constructor.hasOwnProperty(v))
				return this.constructor[v];
			return null;
		},
		enumerable: false
	});
}



function toArray(v) { return Array.apply( [], v ); }

Object.defineProperty(Object.prototype, "merge", { 
    value: function(v) {
        for(var i in v)
			this[i] = v[i];
		return this;
    },
    configurable: false,
    writable: false,
	enumerable: false  // uncomment to be explicit, though not necessary
});

//used for hashing keys:TODO move from here somewhere else
if( !String.prototype.hasOwnProperty( "hashCode" ) )
{
	Object.defineProperty( String.prototype, "hashCode", {
		value: function(){
			var hash = 0, i, c, l;
			if (this.length == 0) return hash;
			for (i = 0, l = this.length; i < l; ++i) {
				c  = this.charCodeAt(i);
				hash  = ((hash<<5)-hash)+c;
				hash |= 0; // Convert to 32bit integer
			}
			return hash;
		},
		enumerable: false
	});
}

Object.equals = function( x, y ) {
  if ( x === y ) return true;
    // if both x and y are null or undefined and exactly the same

  if ( ! ( x instanceof Object ) || ! ( y instanceof Object ) ) return false;
    // if they are not strictly equal, they both need to be Objects

  if ( x.constructor !== y.constructor ) return false;
    // they must have the exact same prototype chain, the closest we can do is
    // test there constructor.

  for ( var p in x ) {
    if ( ! x.hasOwnProperty( p ) ) continue;
      // other properties were tested using x.constructor === y.constructor

    if ( ! y.hasOwnProperty( p ) ) return false;
      // allows to compare x[ p ] and y[ p ] when set to undefined

    if ( x[ p ] === y[ p ] ) continue;
      // if they have the same strict value or identity then they are equal

    if ( typeof( x[ p ] ) !== "object" ) return false;
      // Numbers, Strings, Functions, Booleans must be strictly equal

    if ( ! Object.equals( x[ p ],  y[ p ] ) ) return false;
      // Objects and Arrays must be tested recursively
  }

  for ( p in y ) {
    if ( y.hasOwnProperty( p ) && ! x.hasOwnProperty( p ) ) return false;
      // allows x[ p ] to be set to undefined
  }
  return true;
}
//here goes the ending of commonjs stuff

//create Global Scene
var Scene = LS.GlobalScene = new SceneTree();

LS.newMeshNode = function(id,mesh_name)
{
	var node = new LS.SceneNode(id);
	node.addComponent( new LS.Components.MeshRenderer() );
	node.setMesh(mesh_name);
	return node;
}

LS.newLightNode = function(id)
{
	var node = new LS.SceneNode(id);
	node.addComponent( new LS.Components.Light() );
	return node;
}

LS.newCameraNode = function(id)
{
	var node = new LS.SceneNode(id);
	node.addComponent( new LS.Components.Camera() );
	return node;
}

global.LS = LS;

//*******************************/
})( typeof(window) != "undefined" ? window : self ); //add support to nodejs 
