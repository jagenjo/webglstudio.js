//connects DriveModule with LiteFileSystem

var LFSBridge = {
	name: "Server",
	className: "server",
	tree_root: null, //where the tree root will be added
	units: {},
	session: null,

	init: function()
	{
		LFS.onNewSession = function(session)
		{
			LFSBridge.session = session;
			LFSBridge.updateTree(function() {
				DriveModule.onTreeUpdated();
			});
		}

		//fetch content
		LiteGUI.bind( CORE, "user-login", function(e, user_info){
			DriveModule.updateServerTreePanel();
			DriveModule.showInBrowserContent();
		});

		LiteGUI.bind( CORE, "user-logout", function(){
			DriveModule.updateServerTreePanel();
			DriveModule.showInBrowserContent();
		});

		//DriveModule.top_widget.addButton(null,"Open LiteFileServer", { callback: LFSBridge.onOpenLiteFileServer });
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
					//this.server_resources[ resource.fullpath ] = resource;
					//this.server_resources_by_id[ resource.server_id ] = resource;
				}

				panel.showInBrowserContent( resources );
			}
			else
				panel.showInBrowserContent( null );

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
		var that = this;
		var server_root = this.tree_root;
		if(!server_root)
			return;

		if(!this.session)
		{
			server_root.children = [];
			server_root.folders = [];
			if(callback) 
				callback( null );
			return;
		}

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
			bridge.units = units;

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
				var item = { id: unit.name, unit: unit, type:"unit", dataset: { bridge: LFSBridge.name }, candrag: false, className: 'folder unit', fullpath: unit.name, bridge: bridge }; //ADD MORE INFO
				item.children = get_folders( unit.name, unit.folders );
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
				var folder_path =  fullpath + "/" + i;
				var folder = { id: folder_path, content: i, dataset: { bridge: LFSBridge.name }, fullpath: folder_path, type:"folder", candrag: true, className: 'folder', folder: i, bridge: bridge };
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
			var data = {};
			for(var i in units)
				data[ units[i].name ] = units[i];
			that.units = data;
			if(on_complete)
				on_complete(data);
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
				if(on_error)
					on_error( fullpath, err );
			},
			function(v,e,params){ //on_progress
				//console.log("Progress",v);
				if(on_progress)
					on_progress( fullpath, v, params );
		});
	},

	/*
	uploadRemoteFile: function( url, target_fullpath, on_complete)
	{
		if(!this.session)
			return;

		this.session.uploadRemoteFile( url, target_fullpath, function(v){
			if(on_complete)
				on_complete(v == 1);
		});
	},
	*/

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
	},

	showDriveInfo: function( panel )
	{
		panel = panel || DriveModule;
		var root = panel.browser_container;
		root.innerHTML = "";

		var container = LiteGUI.createElement("div");
		container.className = "drive-info";
		root.appendChild( container );

		container.innerHTML = "<h2>LiteFileServer</h2>";
		var button = LiteGUI.createButton(null, "Go to LFS Panel", LFSBridge.onOpenLiteFileServer );
		container.querySelector("h2").appendChild( button.root );

		container.appendChild( LiteGUI.createElement("h3",null,"Units") );

		if(!this.tree_root.children)
			return;
		
		for(var i = 0; i < this.tree_root.children.length; ++i)
		{
			var unit = this.tree_root.children[i];
			var element = this.createUnitInfo( unit.unit );
			container.appendChild( element );
		}
	},

	createUnitInfo: function( unit )
	{
		var percentage = (unit.used_size / unit.total_size * 100).toFixed(0) + '%';
		var size = Math.floor( unit.used_size / (1024*1024) ).toFixed(2) + " of " + Math.floor( unit.total_size / (1024*1024) ).toFixed(2) + " MBs";
		var content = "<span class='title'>" + unit.name + "</span> Space <span class='space info'>" + size + "</span> Used <span class='amount info'>" + percentage + "</span>";
		var element = LiteGUI.createElement( "div",null, content );
		element.className = "unit-item";
		element.dataset["unit"] = unit.name;
		element.addEventListener("click", function(){ DriveModule.selectFolder( this.dataset["unit"]); });
		var button = LiteGUI.createButton( null, "Open In LFS", function(e){ 
			var unit = this.parentNode.dataset["unit"];
			//TODO: open LFS in this unit
			e.preventDefault();
			e.stopPropagation();
		});
		button.style.float = "right";
		element.appendChild( button.root );
		return element;
	},

	isPath: function( fullpath )
	{
		var folder_name = fullpath.split("/")[0];
		return this.units[ folder_name ];
	},

	getFileInfo: function( fullpath )
	{
		
	},

	getUnitInfo: function( fullpath )
	{
		return this.units[ fullpath ];
	},

	showUnitInfo: function( fullpath )
	{
		var root = DriveModule.browser_container;
		root.innerHTML = "";

		var container = LiteGUI.createElement("div");
		container.className = "drive-info";
		container.innerHTML = "<h2>LiteFileServer</h2>";
		root.appendChild( container );

		var unit = this.getUnitInfo( fullpath );
		if(!unit)
			return;

		var element = this.createUnitInfo( unit );
		container.appendChild( element );

		container.appendChild( LiteGUI.createElement("h3",null,"Information") );
	},

	onContextualMenu: function( fullpath, event )
	{
		var options = ["Create Folder","Delete Folder","Rename"];

		var menu = new LiteGUI.ContextualMenu( options , { event: event, callback: function(v) {
			if(v == "Create Folder")
				DriveModule.onCreateFolderInServer( fullpath );
			else if(v == "Delete Folder")
				DriveModule.onDeleteFolderInServer( fullpath );
		}});
	},

	onOpenLiteFileServer: function()
	{
		window.open( CORE.config.server, "_blank" );
	},

	onFolderSelected: function( item, panel )
	{
		//console.log(item);
		var that = this;

		panel = panel || DriveModule;

		panel.current_folder = item.fullpath;
		panel.current_bridge = this;

		if(item == this.tree_root) //Server
		{
			this.updateTree( function() {
				panel.onTreeUpdated();
				that.showDriveInfo( panel );
			});
			return;
		}
		else if(item.type == "unit")
			this.showUnitInfo( item.fullpath );
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
				DriveModule.uploadAndShowProgress(resource, folder_fullpath, function( v, folder, fullpath ) {
					if(!v)
						return;

					console.log("renaming or moving resource...");
					LS.ResourcesManager.sendResourceRenamedEvent( res_filename, fullpath, resource );
					LS.ResourcesManager.load( fullpath );
				});
				return true;
			}
		}
	}
};

//register
DriveModule.registerDriveBridge( LFSBridge );
CORE.registerModule( LFSBridge );