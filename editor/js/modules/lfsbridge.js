//connects DriveModule with LiteFileSystem

var LFSBridge = {
	name: "Server",
	className: "server",
	tree_root: null, //where the tree root will be added
	session: null,

	init: function()
	{
		LFS.onNewSession = function(session)
		{
			LFSBridge.session = session;
			LFSBridge.updateTree(function() {
				DriveModule.refreshTree();
			});
		}

		DriveModule.top_widget.addButton(null,"Open LiteFileServer", { callback: LFSBridge.onOpenLiteFileServer });
	},

	onOpenLiteFileServer: function()
	{
		window.open( CORE.config.server, "_blank" );
	},

	onFolderSelected: function(item)
	{
		//console.log(item);

		if(item == this.tree_root)
		{
			this.updateTree( function() {
				DriveModule.refreshTree();
				//select bridge root node
				//TODO
			});
			return;
		}

		DriveModule.current_folder = item.fullpath;
		DriveModule.current_bridge = this;
		this.updateContent( item.fullpath );
	},

	//called if a file is dropped in a folder belonging to this bridge
	onDropInFolder: function(folder_fullpath, drop, on_complete)
	{
		var that = this;
		var res_filename = drop.dataTransfer.getData("res-filename");
		var res_fullpath = drop.dataTransfer.getData("res-fullpath");

		if(!res_fullpath)
			res_fullpath = drop.dataTransfer.getData("text/uri-list");

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

		}
		else
		{ //upload to server
			var resource = LS.ResourcesManager.resources[res_filename];
			if(resource)
			{
				//UPLOAD AND SHOW PROGRESS
				DriveModule.uploadAndShowProgress(resource, folder_fullpath, function( v, folder, fullpath ) {
					if(!v)
						return;

					console.log("renaming or moving resource...");
					LS.ResourcesManager.sendResourceRenamedEvent( res_filename, fullpath, resource );
					LS.ResourcesManager.load( fullpath );
				});
			}
		}
	},

	updateContent: function(folder, callback)
	{
		//this.updateBrowserContent(null);
		//this.showLoadingBrowserContent();

		this.getFiles(folder, inner.bind(this));

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
					//this.server_resources[ resource.fullpath ] = resource;
					//this.server_resources_by_id[ resource.server_id ] = resource;
				}

				DriveModule.showInBrowserContent(resources);
			}
			else
				DriveModule.showInBrowserContent(null);

			if(callback) 
				callback();
		}
	},

	getFiles: function(folder, on_complete)
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
		if(!this.session)
			return;

		var that = this;
		var server_root = this.tree_root;
		if(!server_root)
			return;

		this.getServerFoldersTree( inner );

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
	getServerFoldersTree: function(callback)
	{
		var server_root = this.tree_root;  //{ id: "Server", children:[] };
		var bridge = this;

		//request folders
		this.getFolders(inner);

		function inner( units )
		{
			if(!units)
			{
				if(callback) 
					callback(null);
			}

			//server root node in the list
			server_root.children = []; //reset

			for(var i in units)
			{
				var unit = units[i];
				var item = { id: unit.metadata.name, type:"unit", candrag: true, className: 'folder unit', fullpath: unit.name, bridge: bridge }; //ADD MORE INFO
				item.children = get_folders( unit.name + "/", unit.folders );
				server_root.children.push( item );
			}

			if(callback) 
				callback(server_root);
		}

		//recursive function
		function get_folders(fullpath, root)
		{
			var folders = [];
			for(var i in root)
			{
				var folder = { id: i, fullpath: fullpath + "/" + i, type:"folder", candrag: true, className: 'folder', folder: i, bridge: bridge };
				if(root[i])
					folder.children = get_folders(fullpath + "/" + i, root[i] );
				folders.push( folder );
			}
			return folders;
		}
	},

	getFolders: function(on_complete)
	{
		var that = this;
		if(!this.session)
			return;
		this.session.getUnitsAndFolders(function(units){
			that.units = units;
			if(on_complete)
				on_complete(units);
		});
	},


	moveFile: function(fullpath, target_fullpath, on_complete)
	{
		if(!this.session)
			return;

		this.session.moveFile( fullpath, target_fullpath, function(v){
			if(on_complete)
				on_complete(v == 1);
		});
	},

	uploadRemoteFile: function( url, target_fullpath, on_complete)
	{
		if(!this.session)
			return;

		this.session.uploadRemoteFile( url, target_fullpath, function(v){
			if(on_complete)
				on_complete(v == 1);
		});
	},

	uploadFile: function(fullpath, file, on_complete, on_error, on_progress)
	{
		if(!this.session)
			return;

		this.session.uploadFile( fullpath, file, { category: file.category || file.type, generate_preview: true, fullpath: fullpath }, 
			function(v,resp){ //on_complete
				if(on_complete)
					on_complete( fullpath, LFS.getPreviewPath(fullpath) );
			},
			function(err,resp){ //on_error
				console.error(err);
			},
			function(v,e,params){ //on_progress
				//console.log("Progress",v);
				if(on_progress)
					on_progress(v,fullpath);
		});
	},

	uploadRemoteFile: function(url, fullpath, on_complete, on_error)
	{
		if(!this.session)
			return;

		this.session.uploadRemoteFile( url, fullpath,  
			function(v,resp){ //on_complete
				if(on_complete)
					on_complete( fullpath, LFS.getPreviewPath(fullpath) );
			},
			function(err,resp){ //on_error
				console.error(err);
			}
		);
	}
};

//register
DriveModule.registerDriveBridge( LFSBridge );
CORE.registerModule( LFSBridge );