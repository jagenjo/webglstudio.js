//work in progress, not finished yet
//http://www.html5rocks.com/es/tutorials/file/filesystem/

var requestFileSystem = window.requestFileSystem || window.webkitRequestFileSystem || window.mozRequestFileSystem;
var persistentStorage = navigator.persistentStorage || navigator.mozPersistentStorage || navigator.webkitPersistentStorage;

var LocalFilesBridge = {
	name: "Local",
	className: "local",
	tree_root: null, //where the tree root will be added

	DEFAULT_SIZE_MBS: 64,
	current_quota: 0,
	local_storage: null,

	init: function()
	{
		//should add something to enable disable this

		this.requestQuota( function(size){ 
			LocalFilesBridge.current_quota = size;
			LocalFilesBridge.requestFileSystem( LocalFilesBridge.ready.bind(LocalFilesBridge) );
		});
	},

	requestQuota: function( callback )
	{
		persistentStorage.requestQuota( this.DEFAULT_SIZE_MBS * 1024 * 1024, callback, this.errorHandler);	
	},

	requestFileSystem: function( callback )
	{
		requestFileSystem( window.PERSISTENT , this.DEFAULT_SIZE_MBS * 1024*1024, callback, this.errorHandler );
	},

	ready: function( fileSystem )
	{
		console.log("Local FS ready");
		this.local_storage = fileSystem;
		this.createFolder("temp");
		//this.createFile("temp/temp.txt","silly foo");
		//this.readFolder();
	},

	createFolder: function(folder, callback)
	{
		if(!this.local_storage)
			return;

		var lfs = this.local_storage;
		var partial_folders = folder.split("/").filter(function(v){ return !!v;});
		var current = partial_folders.shift();

		function inner()
		{
			lfs.root.getDirectory( current, {create: true}, function(dirEntry) {
				if(partial_folders.length)
				{
					current = current + "/" + partial_folders.shift();
					inner();
				}
				else if(callback)
					callback(folder, dirEntry);
			}, LocalFilesBridge.errorHandler );
		}
	},

	createFile: function(filename, data, callback)
	{
		var type = "application/octet-stream";
		if(data && data.constructor === String)
			type = "text/plain";

		if(!this.local_storage)
			return console.error("Local Storage not created");

		this.local_storage.root.getFile( filename, {create: true}, function(file){
			if(data)
				file.createWriter(function(file_content) {
					var blob = new Blob([data], {type: type});
					file_content.write( blob );
					if(callback)
						callback(filename,file);
				});
			else if(callback)
				callback(filename,file);
		},this.errorHandler);
	},
	
	readFolder: function()
	{
		var dirReader = this.local_storage.root.createReader();
		var entries = [];

		function toArray(list) {
		  return Array.prototype.slice.call(list || [], 0);
		}

		function listResults( result )
		{
			for(var i in result)
			{
				var entry = result[i];
				console.log("FILE:",entry.name);
			}
		}

		// Call the reader.readEntries() until no more results are returned.
		var readEntries = function() {
		 dirReader.readEntries (function(results) {
		  if (!results.length) {
			listResults(entries.sort());
		  } else {
			entries = entries.concat(toArray(results));
			readEntries();
		  }
		},  LocalFilesBridge.errorHandler);
		};

		readEntries(); // Start reading dirs.
	},

	updateContent: function(folder, callback, panel)
	{
		//this.updateBrowserContent(null);
		//this.showLoadingBrowserContent();

		panel = panel || DriveModule;

		this.getFiles( folder, inner.bind(this) );

		function inner(data)
		{
			if(data)
			{
				var resources = {};
				for(var i = 0; i < data.length; i++)
				{
					var resource = data[i];
					resource.in_server = true;
					resources[ resource.fullpath ] = resource;
					//DriveModule.server_resources[ resource.fullpath ] = resource;
					//DriveModule.server_resources_by_id[ resource.server_id ] = resource;
				}

				panel.showInBrowserContent( resources );
			}
			else
				panel.showInBrowserContent( null );

			if(callback) 
				callback();
		}
	},

	getFiles: function( folder, on_complete )
	{
		var that = this;
		if(!this.session)
			return;

		this.session.getFilesByPath( folder, function(files){
			if(on_complete)
				on_complete(files);
		});
	},

	updateTree: function( callback )
	{
		var that = this;
		var server_root = this.tree_root;
		if(!server_root)
			return;

		this.getFoldersTree( inner );

		function inner( tree )
		{
			if(tree)
				server_root.children = tree.children;
			else
				server_root.folders = [];

			if(callback) 
				callback( tree );
		}
	},

	//fill the tree data with the units and folders
	getFoldersTree: function(callback)
	{
		var bridge = this;
		var server_root = this.tree_root;
		if(!server_root)
			return;

		//request folders
		this.getFolders( inner );

		function inner( folders )
		{
			//server root node in the list
			server_root.children = []; //reset

			for(var i in folders)
			{
				var folder = folders[i];
				var item = { id: folder.name, content: folder.name, dataset: { bridge: LocalFilesBridge.name }, candrag: false, type: "folder", className: 'folder', fullpath: folder.name, bridge: bridge };
				//item.children = get_folders( unit.name, unit.folders );
				server_root.children.push( item );
			}

			if(callback) 
				callback(server_root);
		}
	},

	getFolders: function(on_complete)
	{
		var that = this;
		if(!this.local_storage || !on_complete)
			return;

		var reader = this.local_storage.root.createReader();
		var entries = {};

		// Call the reader.readEntries() until no more results are returned.
		var readEntries = function() {
			reader.readEntries (function(results) {
				if (!results.length) {
					on_complete(entries);
				} else {
					  for(var i in results)
					{
						  var entry = results[i];
						  if(entry.isDirectory)
							  entries[i] = entry;
					}
					readEntries(); //get more
				}
			},  LocalFilesBridge.errorHandler);
		};

		readEntries(); // Start reading dirs.
	},

	moveFile: function(fullpath, target_fullpath, on_complete)
	{
		if(!this.local_storage)
			return;
		//TODO
	},

	uploadFile: function( fullpath, data, on_complete, on_error )
	{
		if(!this.local_storage)
			return;

		var type = "application/octet-stream";
		if(data && data.constructor === String)
			type = "text/plain";

		this.local_storage.root.getFile( fullpath, {create: true}, function(file){
			if(data)
				file.createWriter(function(file_content) {
					var blob = new Blob([data], {type: type});
					file_content.write( blob );
					if(callback)
						callback(filename,file);
				});
			else if(callback)
				callback(filename,file);
		}, on_error );
	},

	uploadRemoteFile: function(url, fullpath, on_complete, on_error)
	{
		LiteGUI.alert("TODO");
	},

	showDriveInfo: function( panel )
	{
		if(!panel)
			return;

		var root = panel.browser_container;
		root.innerHTML = "";

		var container = LiteGUI.createElement("div");
		container.className = "drive-info";
		root.appendChild( container );

		container.innerHTML = "<h2>Local</h2><p>QUota: <strong>" + DriveModule.beautifySize(this.current_quota) + "</strong></p>";
	},

	isPath: function( fullpath )
	{
		var folder_name = fullpath.split("/")[0];
		return this.units[ folder_name ];
	},

	getFileInfo: function( fullpath )
	{
		
	},

	onContextMenu: function( fullpath, event )
	{
		var options = ["Create Folder","Delete Folder","Rename"];

		var menu = new LiteGUI.ContextMenu( options , { event: event, callback: function(v) {
			if(v == "Create Folder")
				DriveModule.onCreateFolderInServer( fullpath );
			else if(v == "Delete Folder")
				DriveModule.onDeleteFolderInServer( fullpath );
		}});
	},

	//called from ResourcesPanel tree when a folder is clicked
	onFolderSelected: function( item, panel )
	{
		//console.log(item);
		var that = this;

		//panel.current_folder = item.fullpath;
		//panel.current_bridge = this;

		if(item == this.tree_root) //Server
		{
			this.updateTree( function() {
				panel.onTreeUpdated();
				that.showDriveInfo( panel );
			});
			return;
		}
		else
			this.updateContent( item.fullpath, null, panel );
	},

	processDroppedFile: function( file, data )
	{
		var ext = DriveModule.getExtension( file.name );
		var format = LS.Formats.supported[ ext ];
		if(format)
		{
			if( format.resource )
				file.category = format.resource;
		}
	},

	//something dropped in a folder (could be the tree of the context)
	onDropInFolder: function( folder_fullpath, event )
	{
		var that = this;
		if(!event)
			return;

		//test if they are just regular files from the hard drive
		var files = event.dataTransfer.files;
		if(files && files.length)
		{
			for(var i=0; i < files.length; i++)
			{
				var file = files[i];

				var path = folder_fullpath + "/" + file.name;
				DriveModule.showStartUploadingFile( path );
				that.processDroppedFile( file );
				LFSBridge.uploadFile( path, file, function( path ){
					//refresh
					DriveModule.showEndUploadingFile( path );
					DriveModule.refreshContent();
				}, function( path, err){
					DriveModule.showErrorUploadingFile( path, err );
				}, function( path, progress){
					DriveModule.showProgressUploadingFile( path, progress );
				});

				
				/* why do we need to read it if we are just going to upload it to the server?
				var reader = new FileReader();
				reader.onload = (function(theFile) {
					return function(e) {
						var data =  e.currentTarget.result;
						var path = folder_fullpath + "/" + theFile.name;
						DriveModule.showStartUploadingFile( path );
						that.processDroppedFile( theFile, data );
						LFSBridge.uploadFile( path, data, function(){
							//refresh
							DriveModule.showEndUploadingFile( path );
							DriveModule.refreshContent();
						}, function( path, err){
							DriveModule.showErrorUploadingFile( path, err );
						}, function( path, progress){
							DriveModule.showProgressUploadingFile( path, progress );
						});
					};
				})(file);
				reader.readAsArrayBuffer(file);
				*/
			}
			return true;
		}

		//check if they are resources from other folder
		var res_filename = event.dataTransfer.getData("res-filename");
		var res_fullpath = event.dataTransfer.getData("res-fullpath");

		if(!res_fullpath)
			res_fullpath = event.dataTransfer.getData("text/uri-list");

		//if already has a fullpath (one with a unit...), could be a remote file or to move to other folder
		if(res_fullpath && res_fullpath.split("/").length > 1)
		{
			var res_info = LFS.parsePath(res_fullpath);
			var folder_info = LFS.parsePath(folder_fullpath, true);
			var target_fullpath = folder_info.unit + "/" + folder_info.folder + "/" + res_info.filename;

			if(res_fullpath.substr(0,7) == "http://")
				this.uploadRemoteFile( res_fullpath, target_fullpath, on_server_response ); //download file to server
			else
				this.moveFile(res_fullpath, target_fullpath, on_server_response ); //move to this folder

			function on_server_response(v)
			{
				if(v)
				{
					//tell everyone about a resource renaming
					LS.ResourcesManager.sendResourceRenamedEvent( res_fullpath, target_fullpath, resource );

					//show the folder
					//TODO: select in the tree the element
					that.updateContent( folder_fullpath );

					//if(DriveModule.current_folder != null) 
					//	DriveModule.showResourcesInFolder(DriveModule.current_folder); 
				}
				else
					LiteGUI.alert("Cannot be done (are you logged?)");
			}
			return true;
		}
		else
		{ //upload to server
			var resource = LS.ResourcesManager.resources[res_filename];
			if(resource)
			{
				//UPLOAD AND SHOW PROGRESS
				//....
				return true;
			}
		}
	},

	errorHandler: function(e) {
		if(e.message)
			return console.error(e.message);
	  var msg = '';
	  switch (e.code) {
		case FileError.QUOTA_EXCEEDED_ERR:
		  msg = 'QUOTA_EXCEEDED_ERR';
		  break;
		case FileError.NOT_FOUND_ERR:
		  msg = 'NOT_FOUND_ERR';
		  break;
		case FileError.SECURITY_ERR:
		  msg = 'SECURITY_ERR';
		  break;
		case FileError.INVALID_MODIFICATION_ERR:
		  msg = 'INVALID_MODIFICATION_ERR';
		  break;
		case FileError.INVALID_STATE_ERR:
		  msg = 'INVALID_STATE_ERR';
		  break;
		default:
		  msg = 'Unknown Error';
		  break;
	  };
	  console.log('Local File System Error: ' + msg);
	}
};

//register
//DriveModule.registerDriveBridge( LocalFilesBridge );
//CORE.registerModule( LocalFilesBridge );