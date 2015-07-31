(function(global){

var LiteFileServer = {
	version: "0.1a",
	server_path: "",
	server_filename: "server.php",
	server_url: "./server.php",
	files_path: "./files/",
	preview_prefix: "_tn_",
	preview_sufix: ".jpg",
	previews: "local", //generate previews in local/server
	generate_preview: true,
	preview_size: 128,

	NOT_LOGGED: 0,
	WAITING: 1,
	LOGGED: 2,

	TOKEN_NAME: "lfs_token", //used for the local storage storing

	setup: function( server_path, on_complete )
	{
		this.server_url = server_path + this.server_filename;
		this.server_path = server_path;

		this.checkServer( on_complete );
	},

	//create a session
	login: function( username, password, on_complete)
	{
		//create session
		var session = new LiteFileServer.Session();
		session.server_url = this.server_url;
		session.status = LiteFileServer.WAITING;

		//avoid sending the login plain in the form with a catchy name
		var userpass = btoa( username + "|" + password );

		//fetch info
		this.request(this.server_url, { action:"user/login", loginkey: userpass}, function(resp){
			console.log(resp);
			session.last_resp = resp;
			session.user = resp.user;
			session.status = resp.status == 1 ? LiteFileServer.LOGGED : LiteFileServer.NOT_LOGGED;
			if(resp.session_token)
				session.setToken(resp.session_token);
			if(on_complete)
				on_complete(session, resp);

			if(LFS.onNewSession)
				LFS.onNewSession(session);
		});

		return session;
	},

	//get server info status and config
	checkServer: function( on_complete )
	{
		console.log("Checking Server");
		this.request(this.server_url, { action:"system/ready" }, function(resp) {
			LFS.system_info = resp.info;
			LFS.files_path = resp.info.files_path;
			LFS.preview_prefix = resp.info.preview_prefix;
			LFS.preview_sufix = resp.info.preview_sufix;
			if(on_complete)
				on_complete(resp.status == 1, resp );
		}, function(error){
			console.log("Error Checking Server");
			if(on_complete)
				on_complete(null, error);
		});
	},

	checkExistingSession: function( on_complete )
	{
		var old_token = localStorage.getItem( LiteFileServer.TOKEN_NAME );
		if(!old_token)
		{
			if(on_complete)
				on_complete(null);
			return;
		}

		this.request( this.server_url,{action: "user/checkToken", token: old_token}, function(resp){
			if(!resp.user)
				localStorage.removeItem( LiteFileServer.TOKEN_NAME );

			if(!on_complete)
				return;

			if(resp.user)
			{
				var session = new LiteFileServer.Session();
				session.server_url = LiteFileServer.server_url;
				session.status = LiteFileServer.LOGGED;
				session.user = resp.user;
				session.token = old_token;
				on_complete(session);
				if(LFS.onNewSession)
					LFS.onNewSession(session);
			}
			else
				on_complete(null);


		});
	},

	//create a new account if it is enabled or if you are admin
	createAccount: function(user, password, email, on_complete, on_error, admin_token)
	{
		var params = {action: "user/create", username: user, password: password, email: email };
		if(admin_token)
			params.admin_token = admin_token;
		return this.request( this.server_url, params, function(resp){
			console.log(resp);
			if(on_complete)
				on_complete( resp.status == 1, resp );
		});
	},

	generatePreview: function( file, on_complete )
	{
		var reader = new FileReader();
		reader.onload = loaded;
		reader.readAsDataURL(file);

		var img = null;
		var that = this;

		function loaded(e)
		{
			img = new Image();
			img.src = e.target.result;
			img.onload = ready;
		}

		function ready()
		{
			var canvas = document.createElement("canvas");
			canvas.width = canvas.height = LFS.preview_size;
			var ctx = canvas.getContext("2d");
			var f = LFS.preview_size / (img.width < img.height ? img.width : img.height);
			var offx = (LFS.preview_size - img.width * f) * 0.5;
			var offy = (LFS.preview_size - img.height * f) * 0.5;
			ctx.translate(offx,offy); //center
			ctx.scale(f,f);
			ctx.drawImage(img,0,0);
			var format = "";
			switch( that.preview_sufix.toLowerCase() )
			{
				case ".jpg": format = "image/jpeg"; break;
				case ".png": format = "image/png"; break;
				default:
					console.error("format unknown");
					return;
			}
			var dataURL = canvas.toDataURL(format);
			if(on_complete)
				on_complete(dataURL, img, canvas);
		}
	},

	//http request wrapper
	request: function(url, params, on_complete, on_error, on_progress )
	{
		var xhr = new XMLHttpRequest();
		xhr.open( params ? 'POST' : 'GET' , url, true );

		var formdata = null;
		if(params)
		{
			var formdata = new FormData();
			for(var i in params)
				formdata.append(i, params[i]);
		}

		xhr.onload = function()
		{
			var response = this.response;
			//console.log(params.action);
			if(this.status < 200 || this.status > 299)
			{
				if(on_error)
					on_error(this.status);
				return;
			}

			var type = this.getResponseHeader('content-type');
			if(type == "application/json")
			{
				try
				{
					response = JSON.parse(response);
				}
				catch (err)
				{
					console.error(err); 
				}
			}

			if(on_complete)
				on_complete(response);
			return;
		}

		xhr.onerror = function(err)
		{
			console.error(err);
			if(on_error)
				on_error(err);
		}

		if(on_progress)
			xhr.upload.addEventListener("progress", function(e){
				var progress = 0;
				if (e.lengthComputable)
					progress = e.loaded / e.total;
				on_progress(progress, e, params);
			}, false);

		xhr.send(formdata);
		return xhr;
	},

	clearPath: function(path)
	{
		var t = path.split("/");
		t = t.filter( function(v) { return !!v;} );

		//apply "../", sometimes this gives me problems
		var result = [];
		for(var i = 1; i < t.length; i++)
		{
			if(t[i] == "..")
				result.pop();
			else
				result.push( t[i] );
		}

		return t.join("/");
	},

	getFullpath: function(unit,folder,filename)
	{
		return this.clearPath(unit + "/" + folder + "/" + filename);
	},

	parsePath: function(fullpath, is_folder)
	{
		fullpath = this.clearPath(fullpath); //remove slashes

		//remove url stuff
		var pos = fullpath.indexOf("?");
		if(pos != -1)
			fullpath = fullpath.substr(0,pos);

		var t = fullpath.split("/");
		if(t.length < 2)
			return { unit: is_folder ? fullpath : "",folder:"", filename: is_folder ? "" : fullpath, fullpath: fullpath };

		var unit = t.shift();
		var filename = "";
		if(!is_folder)
			filename = this.clearPath( t.pop() );
		var folder = this.clearPath( t.join("/") );
		if(folder == "/")
			folder = "";

		return {
			unit: unit,
			folder: folder,
			filename: filename,
			fullpath: fullpath,
			getFullpath: function() { return this.unit + "/" + this.folder + (this.folder != "" ? "/" : "") + this.filename }
		};
	},

	getPreviewPath: function(fullpath)
	{
		if(!fullpath)
			return "";
		var info = this.parsePath(fullpath);
		var folder = info.folder;
		if(folder == "/")
			folder = "";
		var server = this.server_path + "/";
		if(!this.server_path || this.server_path == "./" || this.server_path == "/")
			server = "";
		var path = server + this.files_path + "/" + info.unit + "/" + folder + "/" + this.preview_prefix + info.filename + this.preview_sufix;
		path = this.clearPath( path );
		return path;
	},

	getSizeString: function( size )
	{
		return (size/(1024*1024)).toFixed(1) + " MBs";
	},

	requestFile: function(fullpath, on_complete, on_error)
	{
		this.request( this.files_path + "/" + fullpath, null, on_complete, on_error );
	}
};
	
//session
function Session()
{
	this.onsessionexpired = null; //"token not valid"
	this.units = {};
}

LiteFileServer.Session = Session;

//bypass adding the token
Session.prototype.request = function(url, params, on_complete, on_error, on_progress )
{
	if(!this.token)
	{
		console.warn("LFS: not logged in");
		if(on_error)
			on_error(null);
		return;
	}

	params = params || {};
	params.token = this.token;
	var that = this;
	return LiteFileServer.request( url, params, function(resp){
		if(resp.status == -1 && resp.msg == "token not valid")
		{
			if(that.onsessionexpired)
				that.onsessionexpired( that );
		}
		if(on_complete)
			on_complete(resp);
	}, on_error, on_progress );
}

//assign token
Session.prototype.setToken = function(token)
{
	this.token = token;
	//save token
	localStorage.setItem( LiteFileServer.TOKEN_NAME , token );
}

//accounts
Session.prototype.logout = function(on_complete, on_error)
{
	if(	localStorage.getItem( LiteFileServer.TOKEN_NAME ) == this.token)
		localStorage.removeItem( LiteFileServer.TOKEN_NAME );	

	return this.request( this.server_url,{action: "user/logout" }, function(resp){
		if(resp.status != 1)
		{
			if(on_error)
				on_error(resp.msg);
			return;
		}
		if(on_complete)
			on_complete(resp.status == 1);
	});
}

Session.prototype.deleteAccount = function( password, on_complete )
{
	var that = this;
	return this.request( this.server_url,{action: "user/delete", username: this.user.username, password: password }, function(resp){
		if(on_complete)
			on_complete(resp.status == 1, resp);
	});
}

Session.prototype.getUserInfo = function( username, on_complete )
{
	var that = this;
	return this.request( this.server_url,{action: "user/getInfo", username: username }, function(resp){
		if(on_complete)
			on_complete(resp.data, resp);
	});
}

Session.prototype.setUserSpace = function( username, space, on_complete )
{
	var that = this;
	return this.request( this.server_url,{action: "user/setSpace", username: username, space: space }, function(resp){
		if(on_complete)
			on_complete(resp.status, resp);
	});
}


//units
Session.prototype.createUnit = function(unit_name, size, on_complete)
{
	var that = this;
	return this.request( this.server_url,{action: "files/createUnit", unit_name: unit_name, size: size }, function(resp){
		if(resp.unit)
		{
			Session.processUnit(resp.unit);
			that.units[ resp.unit.name ] = resp.unit;
		}
		if(on_complete)
			on_complete(resp.unit, resp);
	});
}

Session.prototype.deleteUnit = function(unit_name, on_complete)
{
	var that = this;
	return this.request( this.server_url,{action: "files/deleteUnit", unit_name: unit_name }, function(resp){
		if(resp.status == 1)
			delete that.units[ unit_name ];
		if(on_complete)
			on_complete(resp.status == 1, resp);
	});
}

Session.prototype.inviteUserToUnit = function(unit_name, username, on_complete)
{
	return this.request( this.server_url,{action: "files/inviteUserToUnit", unit_name: unit_name, username: username }, function(resp){
		if(on_complete)
			on_complete(resp.status == 1, resp);
	});
}

Session.prototype.removeUserFromUnit = function(unit_name, username, on_complete)
{
	return this.request( this.server_url,{action: "files/removeUserFromUnit", unit_name: unit_name, username: username }, function(resp){
		if(on_complete)
			on_complete(resp.status == 1, resp);
	});
}

//get size, and users
Session.prototype.getUnitInfo = function(unit_name, on_complete)
{
	var that = this;
	return this.request( this.server_url,{action: "files/getUnitInfo", unit_name: unit_name }, function(resp){
		if(resp.unit)
		{
			Session.processUnit(resp.unit);
			that.units[ resp.unit.name ] = resp.unit;
		}
		if(on_complete)
			on_complete(resp.unit);
	});
}

//allow to change metadata or size
Session.prototype.setUnitInfo = function(unit_name, info, on_complete)
{
	var that = this;
	var params = {action: "files/setUnitInfo", unit_name: unit_name };

	if(info.metadata)
	{
		if( typeof(info.metadata) == "object")
			info.metadata = JSON.stringify( info.metadata );
		params.metadata = info.metadata;
	}
	if(info.total_size && typeof(info.total_size) == "number")
		params.total_size = parseInt( info.total_size );
	return this.request( this.server_url,params, function(resp){

		if(resp.unit)
		{
			Session.processUnit(resp.unit);
			that.units[ resp.unit.name ] = resp.unit;
		}
		if(on_complete)
			on_complete(resp.status == 1, resp);
	});
}

Session.prototype.setUnitMetadata = function(unit_name, metadata, on_complete)
{
	var that = this;
	if( typeof(metadata) == "object")
		metadata = JSON.stringify(metadata);
	return this.request( this.server_url,{action: "files/setUnitInfo", unit_name: unit_name, info: metadata }, function(resp){
		if(resp.unit)
		{
			Session.processUnit(resp.unit);
			that.units[ resp.unit.name ] = resp.unit;
		}
		if(on_complete)
			on_complete(resp.unit);
	});
}

Session.processUnit = function( unit )
{
	if(!unit)
		return unit;
	unit.used_size = parseInt( unit.used_size );
	unit.total_size = parseInt( unit.total_size );
	if(unit.metadata)
		unit.metadata = JSON.parse(unit.metadata);
	else
		unit.metadata = {};
	return unit;
}

Session.prototype.getUnits = function(on_complete)
{
	var that = this;
	return this.request( this.server_url,{action: "files/getUnits"}, function(resp){
		if(resp.data)
		{
			for(var i in resp.data)
			{
				var unit = resp.data[i];
				Session.processUnit(unit);
				that.units[ unit.name ] = unit;
			}
		}

		if(on_complete)
			on_complete( resp.data, resp );
	});
}

Session.prototype.getUnitsAndFolders = function(on_complete)
{
	var that = this;
	return this.request( this.server_url,{action: "files/getUnits", folders: true}, function(resp){
		if(resp.data)
		{
			for(var i in resp.data)
			{
				var unit = resp.data[i];
				Session.processUnit(unit);
				that.units[ unit.name ] = unit;
			}
		}

		if(on_complete)
			on_complete( resp.data, resp );
	});
}

//folders
Session.prototype.getFolders = function( unit, on_complete, on_error )
{
	return this.request( this.server_url,{ action: "files/getFolders", unit: unit }, function(resp){
		if(resp.status != 1)
		{
			if(on_error)
				on_error(resp.msg);
			return;
		}

		if(on_complete)
			on_complete( resp.data, resp );
	});
}

Session.prototype.createFolder = function( fullpath, on_complete, on_error )
{
	return this.request( this.server_url,{action: "files/createFolder", fullpath: fullpath }, function(resp){

		if(resp.status != 1)
		{
			if(on_error)
				on_error(resp.msg);
			return;
		}

		if(on_complete)
			on_complete(resp.status == 1, resp );
	});
}


Session.prototype.deleteFolder = function( fullpath, on_complete, on_error )
{
	return this.request( this.server_url,{action: "files/deleteFolder", fullpath: fullpath }, function(resp){

		if(resp.status != 1)
		{
			if(on_error)
				on_error(resp.msg);
			return;
		}

		if(on_complete)
			on_complete(resp.status == 1, resp );
	});
}

//files

Session.processFileList = function(list)
{
	if(!list)
		return;

	for(var i in list)
	{
		var file = list[i];
		file.fullpath = file.unit + "/" + file.folder + "/" + file.filename;

		if(file.metadata)
		{
			try
			{
				file.metadata = JSON.parse(file.metadata);
			}
			catch (err)
			{
			}
		}
	}
}

Session.prototype.getFiles = function( unit, folder, on_complete, on_error )
{
	return this.request( this.server_url,{ action: "files/getFilesInFolder", unit: unit, folder: folder }, function(resp){

		if(resp.status < 1)
		{
			if(on_error)
				on_error(resp.msg);
			return;
		}

		Session.processFileList( resp.data, unit + "/" + folder );

		if(on_complete)
			on_complete(resp.data, resp);
	});
}

Session.prototype.getFilesByPath = function( fullpath, on_complete, on_error )
{
	return this.request( this.server_url,{ action: "files/getFilesInFolder", fullpath: fullpath }, function(resp){

		if(resp.status < 0)
		{
			if(on_error)
				on_error(resp.msg);
			return;
		}

		Session.processFileList(resp.data, fullpath );

		if(on_complete)
			on_complete(resp.data, resp);
	});
}

Session.prototype.searchByCategory = function( category, on_complete )
{
	return this.request( this.server_url,{ action: "files/searchFiles", category: category }, function(resp){

		Session.processFileList(resp.data);
		if(on_complete)
			on_complete(resp.data);
	});
}

Session.prototype.searchByFilename = function( filename, on_complete )
{
	return this.request( this.server_url,{ action: "files/searchFiles", filename: filename }, function(resp){
		Session.processFileList(resp.data);
		if(on_complete)
			on_complete(resp.data);
	});
}

Session.prototype.getFileInfo = function( fullpath, on_complete )
{
	return this.request( this.server_url,{ action: "files/getFileInfo", fullpath: fullpath }, function(resp){
		if(on_complete)
			on_complete(resp.data, resp);
	});
}

//Upload a file to the server
//extra could be category, metadata (object or string), preview (in base64)
Session.prototype.uploadFile = function( fullpath, data, extra, on_complete, on_error, on_progress )
{
	var info = LFS.parsePath( fullpath );
	var unit = info.unit;
	if(!unit)
	{
		if(on_error)
			on_error("Unit missing in file fullpath");
		console.error("Unit missing in file fullpath");
		return;
	}

	var folder = info.folder;
	var filename = info.filename;

	//check size
	var max_size = LFS.system_info.max_filesize || 1000000;
	var size = data.byteLength !== undefined ? data.byteLength : data.length;

	if(size === undefined)
		throw("Data is in unknown format type");

	//resolve encoding
	var encoding = "";
	if( data.constructor === ArrayBuffer )
	{
		data = new Blob([data], {type: "application/octet-binary"});
		encoding = "file";
	}
	else if( data.constructor === File || data.constructor === Blob )
	{
		size = data.size;
		encoding = "file";
	}
	else if( data.constructor === String )
		encoding = "string"
	else
		throw("Unknown data format, only string, ArrayBuffer, Blob and File supported");

	if(size > max_size)
	{
		if(on_error)
			on_error('File too large (limit of ' + (max_size/(1024*1024)).toFixed(1) + ' MBs).');
		return;
	}

	var ext = filename.split('.').pop().toLowerCase();
	var extensions = ["png","jpg","jpeg","webp"]; //generate previews of this formats

	var params = { action: "files/uploadFile", unit: unit, folder: folder, filename: filename, encoding: encoding, data: data, extra: extra };
	
	if(extra)
	{
		if( typeof(extra) == "string")
			params.category = extra;
		else {
			if(extra.category)
				params.category = extra.category;
			if(extra.metadata)
				params.metadata = typeof(extra.metadata) == "object" ? JSON.stringify(extra.metadata) : extra.metadata;
			if(extra.preview)
				params.preview = extra.preview;
		}
	}

	var that = this;

	//generate preview and request if they are images
	if(LFS.generate_preview && LFS.previews == "local" && extensions.indexOf(ext) != -1 )
	{
		LFS.generatePreview( data, function( prev_data ) {
			params.preview = prev_data;
			that.request( that.server_url, params, on_resp, on_error, on_progress );
		});
	}
	else
		return this.request( this.server_url, params, on_resp, on_error, on_progress );

	function on_resp(resp)
	{
		if(resp.status != 1)
		{
			if(on_error)
				on_error(resp.msg);
			return;
		}

		if(on_complete)
			on_complete(resp.status == 1, resp);
	}
}

Session.prototype.uploadRemoteFile = function( url, fullpath, on_complete, on_error )
{
	return this.request( this.server_url,{ action: "files/uploadRemoteFile", fullpath: fullpath, url: url }, function(resp){

		if(resp.status != 1)
		{
			if(on_error)
				on_error(resp.msg);
			return;
		}

		if(on_complete)
			on_complete(resp.status == 1, resp);
	}, on_error );
}

Session.prototype.updateFilePreview = function( fullpath, preview, on_complete, on_error )
{
	if( typeof(preview) != "string" )
	{
		console.error("Preview must be a string in base64 encoding");
		return;
	}

	return this.request( this.server_url,{ action: "files/updateFilePreview", fullpath: fullpath, preview: preview }, function(resp){

		if(resp.status != 1)
		{
			if(on_error)
				on_error(resp.msg);
			return;
		}

		if(on_complete)
			on_complete(resp.status, resp);
	}, on_error );
}

Session.prototype.updateFileContent = function( fullpath, data, on_complete, on_error )
{
	if(fullpath.substr(0,5) == "http://")
		throw("LFS does not support full URLs as fullpath");

	//resolve encoding
	var encoding = "";
	if( data.constructor == ArrayBuffer )
	{
		data = new Blob([data.data], {type: "application/octet-binary"});
		encoding = "file";
	}
	else if( typeof(data) != "string" )
		encoding = "file";

	return this.request( this.server_url,{ action: "files/updateFile", fullpath: fullpath, data: data, encoding: encoding }, function(resp){

		if(resp.status != 1)
		{
			if(on_error)
				on_error(resp.msg);
			return;
		}

		if(on_complete)
			on_complete(resp.data);
	}, on_error );
}

//info must be object with optional fields: metadata and category
Session.prototype.updateFileInfo = function( fullpath, info, on_complete, on_error )
{
	if(fullpath.substr(0,5) == "http://")
		throw("LFS does not support full URLs as fullpath");

	if(typeof(info) == "object")
		info = JSON.stringify(info);

	return this.request( this.server_url, { action: "files/updateFileInfo", fullpath: fullpath, info: info }, function(resp){

		if(resp.status != 1)
		{
			if(on_error)
				on_error(resp.msg);
			return;
		}

		if(on_complete)
			on_complete(resp.status == 1);
	}, on_error );
}

Session.prototype.copyFile = function( fullpath, target_fullpath, on_complete, on_error )
{
	if(fullpath.substr(0,5) == "http://")
		throw("LFS does not support full URLs as fullpath");

	return this.request( this.server_url,{ action: "files/copyFile", fullpath: fullpath, target_fullpath: target_fullpath }, function(resp){

		if(resp.status != 1)
		{
			if(on_error)
				on_error(resp.msg);
			return;
		}

		if(on_complete)
			on_complete(resp.status, resp);
	}, on_error );
}

Session.prototype.moveFile = function( fullpath, target_fullpath, on_complete, on_error )
{
	if(fullpath.substr(0,5) == "http://")
		throw("LFS does not support full URLs as fullpath");


	return this.request( this.server_url,{ action: "files/moveFile", fullpath: fullpath, target_fullpath: target_fullpath }, function(resp){

		if(resp.status != 1)
		{
			if(on_error)
				on_error(resp.msg);
			return;
		}

		if(on_complete)
			on_complete(resp.status, resp);
	}, on_error );
}

Session.prototype.deleteFile = function( fullpath, on_complete, on_error )
{
	if(fullpath.substr(0,5) == "http://")
		throw("LFS does not support full URLs as fullpath");

	return this.request( this.server_url,{ action: "files/deleteFile", fullpath: fullpath }, function(resp){

		if(resp.status != 1)
		{
			if(on_error)
				on_error(resp.msg);
			return;
		}

		if(on_complete)
			on_complete(resp.status == 1, resp);
	}, on_error );
}

global.LFS = global.LiteFileServer = LiteFileServer;

})(window);