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
		return this.request(this.server_url, { action:"user/login", loginkey: userpass}, function(resp){
			console.log(resp);
			session.last_resp = resp;
			session.user = resp.user;
			session.status = resp.status > 0 ? LiteFileServer.LOGGED : LiteFileServer.NOT_LOGGED;
			if(resp.session_token)
				session.setToken(resp.session_token);
			if(session && session.status > 0 && LFS.onNewSession)
				LFS.onNewSession(session);
			if(on_complete)
				on_complete(session, resp);
		});
	},

	//get server info status and config
	checkServer: function( on_complete )
	{
		console.log("Checking Server");
		return this.request(this.server_url, { action:"system/ready" }, function(resp) {
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

		return this.request( this.server_url,{action: "user/checkToken", token: old_token}, function(resp){
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

	forgotPassword: function( email, on_complete, redirect_url )
	{
		var params = { action: "user/forgotPassword", email: email };
		if(redirect_url)
			params.redirect = redirect_url;

		return this.request( this.server_url, params, function(resp){
			if(on_complete)
				on_complete( resp.status == 1, resp );
		});
	},

	validateResetPassword: function( email, token, on_complete )
	{
		var params = { action: "user/resetPassword", email: email, token: token };

		return this.request( this.server_url, params, function(resp){
			if(on_complete)
				on_complete( resp.status == 1, resp );
		});
	},

	//create a new account if it is enabled or if you are admin
	createAccount: function( user, password, email, on_complete, on_error, admin_token, userdata )
	{
		//validate username
		if( !user.match(/^[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)*$/) )
		{
			if(on_error)
				on_error("Invalid username");
			if(on_complete)
				on_complete( null, {msg:"Invalid username"} );
			return false;
		}

		//validate password
		if( password.length < 3 )
		{
			if(on_error)
				on_error("Password is too short");
			if(on_complete)
				on_complete( null, {msg:"Password too short"} );
			return false;
		}

		//validate email
		if( !email.match(/^([\w-]+(?:\.[\w-]+)*)@((?:[\w-]+\.)*\w[\w-]{0,66})\.([a-z]{2,6}(?:\.[a-z]{2})?)$/i) )
		{
			if(on_error)
				on_error("Invalid email");
			if(on_complete)
				on_complete( null, {msg:"Invalid email"} );
			return false;
		}

		var params = {
			action: "user/create",
			username: user,
			password: password,
			email: email
		};

		if( userdata )
			params.userdata = userdata;

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
		if(!file)
		{
			console.error("LiteFileServer GeneratePreview requires a file");
			return;
		}

		if(file.constructor === ArrayBuffer )
			file = new Blob([file], {type: "application/octet-binary"});

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
	request: function(url, params, on_complete, on_error, on_progress, skip_parse )
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
			if(!skip_parse && type == "application/json")
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
				on_progress( progress, e, params );
			}, false);

		xhr.send(formdata);
		return xhr;
	},

	cleanPath: function(path)
	{
		var protocol = "";
		var protocol_index = path.indexOf("://");
		if( protocol_index != -1 )
		{
			protocol = path.substr(0, protocol_index + 3 );
			path = path.substr( protocol_index + 3 );
		}


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

		return protocol + t.join("/");
	},

	getFullpath: function(unit,folder,filename)
	{
		return this.cleanPath(unit + "/" + folder + "/" + filename);
	},

	validateFilename: function( filename )
	{
		var rg = /^[0-9a-zA-Z\_\- ... ]+$/;
		return rg.test(fullpath);
	},

	validateFolder: function( folder )
	{
		if(!folder)
			return true;
		var rg = /^[0-9a-zA-Z\/\_\- ... ]+$/;
		return rg.test(folder);
	},

	parsePath: function(fullpath, is_folder)
	{
		//check for invalid characters (slashes supported)
		var rg = /^[0-9a-zA-Z\/\_\- ... ]+$/;
		if(!rg.test(fullpath))
			return null; //invalid name

		fullpath = this.cleanPath(fullpath); //remove slashes

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
			filename = this.cleanPath( t.pop() );
		var folder = this.cleanPath( t.join("/") );
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

	getPreviewPath: function( fullpath, ignore_cache )
	{
		if(!fullpath)
			return "";
		var info = this.parsePath(fullpath);
		if(!info)
			return null;
		if(!info.unit)
			return;
		var folder = info.folder;
		if(folder == "/")
			folder = "";
		var server = this.server_path + "/";
		if(!this.server_path || this.server_path == "./" || this.server_path == "/")
			server = "";
		var path = server + this.files_path + "/" + info.unit + "/" + folder + "/" + this.preview_prefix + info.filename + this.preview_sufix;
		path = this.cleanPath( path );
		if(ignore_cache)
			path += "?nocache=" + getTime() + Math.floor(Math.random() * 1000);
		return path;
	},

	getSizeString: function( size )
	{
		return (size/(1024*1024)).toFixed(1) + " MBs";
	},

	requestFile: function(fullpath, on_complete, on_error)
	{
		this.request( this.files_path + "/" + fullpath, null, on_complete, on_error, null, true );
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

	return this.request( this.server_url,{ action: "user/logout" }, function(resp){
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

Session.prototype.setPassword = function( oldpass, newpass, on_complete )
{
	var params = { action: "user/setPassword", oldpass: oldpass, newpass: newpass };

	return this.request( this.server_url, params, function(resp){
		console.log(resp);
		if(on_complete)
			on_complete( resp.status == 1, resp );
	});

	return true;
}

Session.prototype.adminChangeUserPassword = function(username, password, on_complete)
{
	return this.request( this.server_url,{action: "user/changeUserPassword", username: username, pass: password }, function(resp){
		if(on_complete)
			on_complete(resp.status == 1, resp);
	});
}

Session.prototype.getUserData = function( on_complete )
{
	var params = { action: "user/getUserData" };

	return this.request( this.server_url, params, function(resp){
		console.log(resp);
		if(on_complete)
			on_complete( resp.userdata );
	});

	return true;
}

Session.prototype.setUserData = function( userdata, on_complete )
{
	var params = { action: "user/setUserData", userdata: userdata };
	return this.request( this.server_url, params, function(resp){
		console.log(resp);
		if(on_complete)
			on_complete( resp.status == 1, resp );
	});

	return true;
}

Session.prototype.deleteAccount = function( password, on_complete )
{
	var that = this;
	return this.request( this.server_url,{action: "user/delete", username: this.user.username, password: password }, function(resp){
		if(on_complete)
			on_complete(resp.status == 1, resp);
	});
}

Session.prototype.deleteUserAccount = function( username, on_complete )
{
	var that = this;
	return this.request( this.server_url,{action: "user/delete", username: username }, function(resp){
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
	size = parseInt(size);
	if(size < 1)
		throw("createUnit: Size cannot be zero or less");

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

Session.prototype.joinUnit = function( token, on_complete )
{
	var that = this;
	return this.request( this.server_url,{action: "files/joinUnit", invite_token: token }, function(resp){
		if(resp.unit)
		{
			Session.processUnit(resp.unit);
			that.units[ resp.unit.name ] = resp.unit;
		}
		if(on_complete)
			on_complete(resp.unit, resp);
	});
}

Session.prototype.leaveUnit = function( unit_name, on_complete )
{
	var that = this;
	return this.request( this.server_url,{action: "files/leaveUnit", unit_name: unit_name }, function(resp){
		if(resp.status == 1)
			delete that.units[ unit_name ];
		if(on_complete)
			on_complete( resp.status == 1, resp);
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

Session.prototype.setUserPrivileges = function(unit_name, username, mode, on_complete)
{
	return this.request( this.server_url,{action: "files/setUserPrivileges", unit_name: unit_name, username: username, mode: mode }, function(resp){
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
	
	if(info.total_size)
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

Session.prototype.downloadFolder = function( fullpath, on_complete, on_error )
{
	return this.request( this.server_url,{action: "files/downloadFolder", fullpath: fullpath }, function(resp){

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

Session.prototype.searchByCategory = function( category, on_complete, on_error, on_progress  )
{
	return this.request( this.server_url,{ action: "files/searchFiles", category: category }, function(resp){
		Session.processFileList(resp.data);
		if(on_complete)
			on_complete(resp.data);
	}, on_error, on_progress );
}

Session.prototype.searchByFilename = function( filename, on_complete, on_error, on_progress )
{
	return this.request( this.server_url,{ action: "files/searchFiles", filename: filename }, function(resp){
		Session.processFileList(resp.data);
		if(on_complete)
			on_complete(resp.data);
	}, on_error, on_progress );
}

Session.prototype.getFileInfo = function( fullpath, on_complete )
{
	return this.request( this.server_url,{ action: "files/getFileInfo", fullpath: fullpath }, function(resp){
		if(on_complete)
			on_complete(resp.data, resp);
	});
}


/**
* Uploads a file to the server (it allows to send other info too like preview)
* @method uploadFile
* @param {String} fullpath
* @param {ArrayBuffer||Blob||File||String} data 
* @param {Object} extra could be category, metadata (object or string), preview (in base64)
* @param {Function} on_complete
* @param {Function} on_error
* @param {Function} on_progress receives info about how much data has been sent
*/
Session.prototype.uploadFile = function( fullpath, data, extra, on_complete, on_error, on_progress )
{
	if(data == null || data == undefined)
		throw("Data cannot be null");

	var original_data = data;

	var info = LFS.parsePath( fullpath );
	if(!info)
	{
		if(on_error)
			on_error("Filename has invalid characters");
		console.error("Filename has invalid characters: " + fullpath );
		return;
	}

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
	var allow_big_files = LFS.system_info.allow_big_files;
	var size = null;
	
	//resolve encoding
	var encoding = "";
	if( data.constructor === ArrayBuffer )
	{
		//data = new Blob([data], {type: "application/octet-binary"});
		//size = data.size;
		size = data.byteLength;
		encoding = "arraybuffer";
	}
	else if( data.constructor === File || data.constructor === Blob )
	{
		size = data.size;
		encoding = "file";
	}
	else if( data.constructor === String )
	{
		size = data.length;
		encoding = "string";
	}
	else
		throw("Unknown data format, only string, ArrayBuffer, Blob and File supported");

	if(size === undefined)
		throw("Size is undefined");

	var ext = filename.split('.').pop().toLowerCase();
	var extensions = ["png","jpg","jpeg","webp"]; //generate previews of this formats
	var params = { action: "files/uploadFile", unit: unit, folder: folder, filename: filename, encoding: encoding, data: data }; //, extra: extra

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

	//check size for file splitting in several files in case the size is bigger than what HTTP can support
	if(size > max_size)
	{
		if(!allow_big_files)
		{
			if(on_error)
				on_error('File too large (limit of ' + (max_size/(1024*1024)).toFixed(1) + ' MBs).');
			return;
		}

		//convert
		if(data.constructor == Blob || data.constructor == File)
		{
			//convert to ArrayBuffer
			var fileReader = new FileReader();
			fileReader.onload = function() {
				var arrayBuffer = this.result;
				that.uploadFile( fullpath, arrayBuffer, extra, on_complete, on_error, on_progress );
			};
			fileReader.readAsArrayBuffer( data );
			return null;
		}

		//segment file
		var num_parts = Math.ceil( size / max_size) + 1; //extra part to ensure no problems
		var part_size = Math.ceil( size / num_parts );
		var file_parts = [];

		if(data.constructor === String)
		{
			//TODO
			throw("String big file split not implemented yet");
		}
		else if(data.constructor === ArrayBuffer)
		{
			var data_buffer = new Uint8Array( data );
			for(var i = 0; i < num_parts; ++i)
			{
				var part_start = i*part_size;
				var part_end = (i+1)*part_size;
				if( (part_end - part_start) > max_size)
					part_end = part_start + max_size;
				var part_size = part_end - part_start;
				var part_data = data_buffer.subarray( part_start, part_end ); //second parameter is end, no size
				if(!part_size || !part_data.length)
					break;
				file_parts.push({part: i, start: part_start, end: part_end, size: part_size, data: part_data});
			}
		}

		//create empty file before filling it
		delete params["data"];
		params.total_size = size;

		var req = that.request( that.server_url, params, function(resp){
			
			if(resp.status == -1)
			{
				if(on_error)
					on_error(resp.msg,resp);
				return;
			}

			var total_parts = file_parts.length;
			var parts_sent = 0;

			inner_send_part();

			function inner_send_part()
			{
				var part = file_parts.shift();
				params.action = "files/updateFilePart";
				params.fullpath = fullpath;
				params.offset = part.start;
				params.total_size = size;
				params.data = new Blob([part.data], {type: "application/octet-binary"});
				params.encoding = "file";

				var req = that.request( that.server_url, params, function(resp){
					if(resp.status == -1)
					{
						if(on_error)
							on_error( resp.msg, resp );
						return;
					}
					parts_sent++;
					if(on_progress)
						on_progress(fullpath, parts_sent / total_parts);
					if( file_parts.length )
						inner_send_part();
					else
					{
						//FINISH
						if(on_complete)
							on_complete(fullpath);
					}
				}, function(err){
					if(on_error)
						on_error( err );
				}, function(v, e){
					if(on_progress)
						on_progress((parts_sent + v) / total_parts, e, params );
				});
			}


		}, on_error);

		return null;
	}

	//force FILE
	if( params.encoding == "arraybuffer" )
	{
		params.encoding = "file";
		params.data = new Blob([params.data], {type: "application/octet-binary"});
	}


	//generate preview and request if they are images
	if(!params.preview && LFS.generate_preview && LFS.previews == "local" && extensions.indexOf(ext) != -1 )
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

	var info = LFS.parsePath( fullpath );
	if(!info)
	{
		if(on_error)
			on_error("Filename has invalid characters");
		console.error("Filename has invalid characters: " + fullpath);
		return;
	}

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

	var info = LFS.parsePath( fullpath );
	var target_info = LFS.parsePath( fullpath );
	if( !info || !target_info )
	{
		if(on_error)
			on_error("Filename has invalid characters");
		console.error("Filename has invalid characters: " + fullpath );
		return;
	}

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

	var info = LFS.parsePath( target_fullpath );
	if( !info )
	{
		if(on_error)
			on_error("Filename has invalid characters");
		console.error("Filename has invalid characters: " + target_fullpath);
		return;
	}

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

//ADMIN BACKUPS STUFF
Session.prototype.getBackupsList = function( on_complete )
{
	var params = {action: "system/backups"};
	return this.request( this.server_url, params, function(resp){
		console.log(resp);
		if(on_complete)
			on_complete( resp.status == 1, resp );
	});
}

Session.prototype.createBackup = function( name, on_complete )
{
	var params = {action: "system/createBackup", name: name };
	return this.request( this.server_url, params, function(resp){
		console.log(resp);
		if(on_complete)
			on_complete( resp.status == 1, resp );
	});
}

Session.prototype.restoreBackup = function( name, on_complete )
{
	var params = {action: "system/restoreBackup", name: name };
	return this.request( this.server_url, params, function(resp){
		console.log(resp);
		if(on_complete)
			on_complete( resp.status == 1, resp );
	});
}

Session.prototype.deleteBackup = function( name, on_complete )
{
	var params = {action: "system/deleteBackup", name: name };
	return this.request( this.server_url, params, function(resp){
		console.log(resp);
		if(on_complete)
			on_complete( resp.status == 1, resp );
	});
}


global.LFS = global.LiteFileServer = LiteFileServer;

})(window);