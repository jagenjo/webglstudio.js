var fs = require('fs');
var exec = require('child_process').exec;
var spawn = require('child_process').spawn;
var http = require('http');
//var download = require('download');

var Mitsuba = {

	last_id: 0,
	clients: [],
	clients_by_id: {},

	temp_folder: "temp",
	valid_extensions: {"jpg":true,"png":true,"obj":true,"serialized":true},

	start: function()
	{
		//create temp folder
		if (!fs.existsSync( this.temp_folder )){
			fs.mkdirSync( this.temp_folder );
			if (!fs.existsSync( this.temp_folder )){
				console.log("Error: cannot create temp folder. Check privileges");
			}
		}
	},

	onClientJoin: function( connection )
	{
		var client = new Client( connection );
		client.id = this.last_id;
		this.last_id++;
		this.clients.push( client );
		this.clients_by_id[ client.id ] = client;
		return client;
	},

	onClientLeave: function( client )
	{
		client.onLeave();
		var index = this.clients.indexOf( client );
		if(index == -1)
			return;
		this.clients.splice( index, 1 );
		delete this.clients_by_id[ client.id ];
	},

	onRequest: function ( request, response )
	{
		if(1)
		{
			response.end( JSON.stringify( { 
				server: "mitsuba",
				clients: this.clients_by_id
			})); //send a response
		}
	}
};

function Client( connection )
{
	this.connection = connection;
	this.id = -1;
	this.ip = connection.remoteAddress;
	this.folder = Mitsuba.temp_folder + "/" + "user_test";
	this.status = "waiting";
	this.mitsuba_process = null;
	this.all_processes = [];

	this.current_bin = null;
	this._files_pending = 0;

	this.scene = null;

	if (!fs.existsSync( this.folder )){
		fs.mkdirSync( this.folder );
		if (!fs.existsSync( this.folder )){
			console.log("Error: cannot create user folder. Check privileges");
		}
	}

	this.send({ action:"info", folder: this.folder });
}

//for JSON messages
Client.prototype.onMessage = function( msg )
{
	var that = this;
	if(msg.action == "scene")
	{
		this.writeFile( "scene.xml", msg.xml );
		this.scene = msg.xml;
		this.log("scene received" );
	}
	else if(msg.action == "rename")
	{
		fs.rename( this.folder + "/file.bin", this.folder + "/" + msg.filename );
		this.log("file renamed to: " + msg.filename );
	}
	else if(msg.action == "renderFrame")
	{
		if(msg.xml)
		{
			this.writeFile( "scene.xml", msg.xml );
			this.scene = msg.xml;
		}
		this.log("starting render..." );
		this.startRender();
	}
	else if(msg.action == "startbin")
	{
		this._files_pending += 1;
		this.log("starting bin file for: " + msg.filename );
		if( msg.filename.indexOf("/") != -1 ) //safety
			return;
		var fullpath = this.folder + '/' + msg.filename;
		if( this.current_bin && this.current_bin.stream )
			this.current_bin.stream.end();
		this.current_bin = {
			filename: fullpath,
			basename: msg.filename,
			stream: fs.createWriteStream( fullpath )
		};
	}
	else if(msg.action == "endbin")
	{
		if( !this.current_bin || !this.current_bin.stream )
			return;
	
		this.log("ending bin file for: " + this.current_bin.basename );
		var filename = 	this.current_bin.filename;
		var basename = 	this.current_bin.basename;
		this.current_bin.stream.end(null,null, function(){
			if( msg.size )
			{
				var stats = fs.statSync( filename );
				if( stats.size != msg.size )
					that.error("Size missmatch: " + stats.size + " of " + msg.size );
			}
			that._files_pending -= 1;
			if(msg.unzip)
				that.unzipFile( basename );
		});
		this.current_bin = null;
	}
	else if(msg.action == "download")
	{
		this.downloadURL( msg.url, msg.full_url );
	}
}

Client.prototype.writeFile = function( filename, data )
{
	if( filename.indexOf("/") != -1 ) //safety
	{
		console.log("dangerous filename:", filename );
		return;
	}

	var that = this;
	this._files_pending += 1;
	var final_filename = this.folder + "/" + filename;
	var wstream = fs.createWriteStream( final_filename );
	wstream.write( data );
	wstream.end(null,null, function(){
		if (!fs.existsSync( final_filename ))
			console.log("Warning: file not written!",final_filename);
		that._files_pending -= 1;
	});
}

Client.prototype.unzipFile = function( filename, on_complete )
{
	var that = this;
	var process = spawn( 'unzip', [ '-o', filename ], { cwd: this.folder } ); //-o for overwrite
	this.all_processes.push( process );

	process.stdout.on('data', function (data) {
		that.log('stdout: ' + data.toString());
	});

	process.stderr.on('data', function (data) {
	  that.log('stderr: ' + data.toString());
	});

	process.on('exit', function (code) {
	  that.log('zip process exited with code ' + code.toString());
	  var index = that.all_processes.indexOf( process );
	  if( index != -1 )
		that.all_processes.splice(index,1);
	  if(on_complete)
		  on_complete();
	});	
}

Client.prototype.onBinary = function( data )
{
	if( !this.current_bin || !this.current_bin.stream )
		return;
	this.current_bin.stream.write( data );
	//console.log("bin data received:",data.length);
}

Client.prototype.send = function( data )
{
	if( data.constructor === Object )
		this.connection.send( JSON.stringify( data ) );
	else if( data.constructor === ArrayBuffer )
	{
		var buffer = new Buffer( msg.buffer );
		this.connection.sendBytes( buffer );
	}
}

Client.prototype.log = function(msg)
{
	var args = Array.prototype.slice.call(arguments);
	var d = args.join(",");
	//if( d.indexOf("\r") == -1 ) //avoid filling the console
		console.log( this.ip,":",d );
	this.send({ action:"log", content: d });
}

Client.prototype.error = function(msg)
{
	var args = Array.prototype.slice.call(arguments);
	var d = args.join(",");
	//if( d.indexOf("\r") == -1 ) //avoid filling the console
		console.error( this.ip,":",d );
	this.send({ action:"error", content: d });
}

Client.prototype.getFileExtension = function( filename )
{
	var index = filename.lastIndexOf(".");
	if(index == -1)
		return "";
	return filename.substr(index+1).toLowerCase();
}

Client.prototype.downloadURL = function( filename, url, on_complete )
{
	var that = this;
	var ext = this.getFileExtension( filename );
	if( !Mitsuba.valid_extensions[ ext ] || filename.indexOf("..") != -1 )
	{
		this.log("invalid filename");
		return false;
	}

	var fullname = this.folder + "/" + filename;

	if ( fs.existsSync( fullname ) )
		return false; //already downloaded

	this.log( "Downloading remote file: " + filename );

	//node stuff
	var file = fs.createWriteStream( fullname );
	this._files_pending += 1;
	var request = http.get( url, function(response) {
		if(response.statusCode != 200)
		{
			that.log("File not found: " + filename);
			return;
		}
		response.pipe(file);
		that._files_pending -= 1;
		that.log( "File downloaded: " + filename );
		if(on_complete)
			on_complete();
	});

	request.on('error', (e) => {
		that.error('problem with request: ' + e.message );
	});

	return true;
}

Client.prototype.startRender = function()
{
	var that = this;

	//call mitsuba
	if( this._files_pending > 0 )
	{
		this.log("Files pending... waiting");
		setTimeout( this.startRender.bind(this), 2000 );
		return;
	}
	this.log("Files ready.");
	this.log("Launching render process...");
	this.launchMitsuba( inner_complete, inner_on_error );

	function inner_complete()
	{
		that.send({ action: "frame_ready", url: that.folder + "/scene.png" });
	}

	function inner_on_error(code)
	{
		that.send({ action: "error_mitsuba", code: code });
	}
}

Client.prototype.launchMitsuba = function( on_complete, on_error )
{
	//kill if still running
	if( this.mitsuba_process )
		this.mitsuba_process.kill();

	//launch mitsuba process
	var that = this;
	var process = this.mitsuba_process = spawn( 'mitsuba', [ 'scene.xml', '-o', 'scene.exr'], { cwd: this.folder } );
	this.all_processes.push( process );

	//get output
	process.stdout.on('data', function (data) {
		that.log('stdout: ' + data.toString() );
	});

	process.stderr.on('data', function (data) {
		that.log('stderr: ' + data.toString());
	});

	process.on('exit', function (code) {
		that.log('mitsuba process exited with code ' + code.toString());
		that.mitsuba_process = null;
		var index = that.all_processes.indexOf( process );
		if( index != -1 )
			that.all_processes.splice( index, 1 );
		if( code != 0 ) //error
		{
			if(on_error)
				on_error(code)
			return;
		}
		that.applyToneMapping( on_complete );
	});	
}

Client.prototype.applyToneMapping = function( on_complete )
{
	//launch mitsuba process
	var that = this;
	var process = spawn( 'mtsutil', [ 'tonemap', 'scene.exr' ], { cwd: this.folder } );
	this.all_processes.push( process );

	//get output
	process.stdout.on('data', function (data) {
		that.log('stdout: ' + data.toString());
	});

	process.stderr.on('data', function (data) {
		that.log('stderr: ' + data.toString());
	});

	process.on('exit', function (code) {
		that.log('tonemapping process exited with code ' + code.toString());
		var index = that.all_processes.indexOf( process );
		if( index != -1 )
			that.all_processes.splice(index,1);
		if(on_complete)
			on_complete();
	});	
}


Client.prototype.onLeave = function()
{
	var that = this;
	console.log( "user leaving: " + this.ip );
	if (fs.existsSync( this.folder )){
		//clear folder on disconnection
		if(1)
			return;
		that.log("Deleting user temp folder...");
		deleteFolderRecursive( that.folder );
		that.log("Folder deleted");
	}

	//do not leave anything running
	if(this.all_processes.length)
	{
		that.log("Killing all processes atteched to client");
		for(var i = 0; i < this.all_processes.length; ++i)
		{
			var process = this.all_processes[i];
			process.kill();
		}
		this.all_processes.length = 0;
	}
}

Client.prototype.toJSON = function()
{
	return {
		id: this.id,
		ip: this.ip,
		status: this.status
	};
}

module.exports = Mitsuba;


var deleteFolderRecursive = function(path) {
  if (fs.existsSync(path)) {
    fs.readdirSync(path).forEach(function(file, index){
      var curPath = path + "/" + file;
      if (fs.lstatSync(curPath).isDirectory()) { // recurse
        deleteFolderRecursive(curPath);
      } else { // delete file
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(path);
  }
};