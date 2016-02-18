/* This module allow to browse the resources (in memory, local or in the repository) 
	TODO: Local repository uses IndexedDB to store the files Blobs
*/

var DriveModule = {
	name: "Drive",
	bigicon: "imgs/tabicon-drive.png",

	server_url: "",

	registered_drive_bridges: {},

	//this tree contains all the info about the files in the system
	tree: { id:"Files", skipdrag:true, visible: false, children:[ {id:"Memory", skipdrag:true, className:"memory", children:[], callback: function() { DriveModule.showMemoryResources(); return true; } } ]},

	server_resources: {}, //indexed by filename (includes all resources on the server) 
	server_resources_by_id: {}, //indexed by id in DB

	visible_resources: null, //resources shown on the browser window
	current_folder: null, //current selected server folder
	current_bridge: null, //bridge in charge of this folder
	jpeg_quality: 0.8, //when encoding previews
	preview_format: "image/jpg",
	preview_size: 256,
	generated_previews: {}, //cache generated previews 

	categories_by_type: { "image/jpeg":"Texture", "image/jpg":"Texture", "image/webp": "Texture", "image/png": "Texture" },
	categories_by_extension: { "obj": "Mesh", "txt": "Text", "dds":"Texture" },

	selected_resource: null, //seletec item in the browser

	root: null,

	insert_resource_callbacks: [],

	init: function()
	{
		this.server_url = CORE.config.server;

		if(CORE.config.proxy)
			LS.ResourcesManager.setProxy( CORE.config.proxy );

		LS.ResourcesManager.keep_files = true;
		var that = this;

		//Loading notifications
		LEvent.bind( LS.ResourcesManager, "resource_loading", function( e, url ) {
			NotifyModule.show("FILE: " + url, { id: "res-msg-" + url.hashCode(), closable: true, time: 0, left: 60, top: 30, parent: "#visor" } );
		});

		LEvent.bind( LS.ResourcesManager, "resource_loading_progress", function( e, data ) {
			var id = "res-msg-" + data.url.hashCode();
			var msg = NotifyModule.get(id);
			if(msg)
				msg.setProgress( data.progress );
		});
		
		LEvent.bind( LS.ResourcesManager, "resource_loaded", function(e, url) {
			EditorModule.refreshAttributes();
			var msg = document.getElementById( "res-msg-" + url.hashCode() );
			if(!msg)
				return;
			msg.content.style.backgroundColor = "rgba(100,200,150,0.5)";
			msg.kill(500);

			if( url.substr(0,7) != "http://" )
				DriveModule.fetchPreview(url);
		});

		LEvent.bind( LS.ResourcesManager, "resource_not_found", function(e, url) {
			var msg = document.getElementById( "res-msg-" + url.hashCode() );
			if(!msg)
				return;
			msg.content.style.backgroundColor = "rgba(200,100,100,0.5)";
			msg.kill(1000);
		});

		//this uses the texture thumbnails as a low resolution version while loading the high res
		LEvent.bind( LS.ResourcesManager, "load_resource_preview", function(e, url) {
			if(url.indexOf("http") != -1)
				return; //external file
			if(url.toLowerCase().indexOf("cubemap") != -1)
				return;

			var folder = LS.RM.getFolder( url );
			var basename = LS.RM.getBasename( url );
			var filename = LS.RM.getFilename( url );
			var extension = LS.RM.getExtension( url );
			var format_info = LS.Formats.getFileFormatInfo( extension );
			if(format_info.resourceClass === GL.Texture)
			{
				var preview_url = folder + "/_th_" + filename + ".jpg";
				LS.ResourcesManager.load( preview_url, { is_preview: true, preview_of: url } );				
			}
		});


		//initGUI **********************
		this.tab = LiteGUI.main_tabs.addTab( this.name, {id:"drivetab", bigicon: this.bigicon, size: "full", content:"", 
			callback: function(tab){
				InterfaceModule.setSidePanelVisibility(true);		
				InterfaceModule.sidepaneltabs.selectTab("Inspector");
			},
			callback_leave: function(tab) {
				if(DriveModule.resources_panel.on_resource_selected_callback)
				{
					DriveModule.resources_panel.on_resource_selected_callback(null);
					DriveModule.resources_panel.on_resource_selected_callback = null;
				}
			}
		});
		this.root = LiteGUI.main_tabs.root.querySelector("#drivetab");

		LEvent.bind( LS.ResourcesManager, "resource_registered", function(e,res) { 
			DriveModule.onResourceRegistered(res); 
		});

		//keep original files to store on server
		LS.ResourcesManager.keep_original = true;

		//use this component to select resources
		EditorModule.showSelectResource = DriveModule.showSelectResource;

		this.createPanel(); //creates tree too

		LiteGUI.menubar.add("Window/Resources Panel", { callback: function(){ ResourcesPanelWidget.createDialog(); }});
	},

	createPanel: function()
	{
		var resources_area = this.root;
		var that = this;

		//create
		this.resources_panel = new ResourcesPanelWidget();
		this.root.appendChild( this.resources_panel.root );

		//bind
		LiteGUI.bind( this.resources_panel, "item_selected", function(e){
			var element = e.detail;
			if(!element)
				return;

			var filename = element.dataset["fullpath"] || element.dataset["filename"];
			if(filename)
				that.showResourceInfo( filename );
		});
	},

	guessCategoryFromFile: function(file)
	{
		var category = this.categories_by_type[ file.type ];
		var ext = LS.RM.getExtension( file.name );
		if(!category)
			category = this.categories_by_extension[ ext ];
		if(!category && ext == "wbin")
		{
			//hardcoded...
			if(file.name.indexOf(".mesh.") != -1)
				category = "Mesh";
		}
		return category;
	},

	openTab: function()
	{
		LiteGUI.main_tabs.selectTab( this.name );
	},

	closeTab: function()
	{
		LiteGUI.main_tabs.selectTab( RenderModule.name );
	},

	//Bridges represent places to store resources (LiteFileServer, localStorage, Dropbox...)
	registerDriveBridge: function(bridge)
	{
		//register bridge
		this.registered_drive_bridges[ bridge.name ] = bridge;

		//create a tree entry
		bridge.tree_root = { id: bridge.name , skipdrag:true, className: bridge.className, children:[], bridge: bridge };

		//add entry to global tree
		this.tree.children.push( bridge.tree_root );
	},

	getDriveBridge: function(name)
	{
		return this.registered_drive_bridges[ name ];
	},

	showStartUploadingFile: function( fullpath )
	{
		NotifyModule.show("UPLOAD: " + fullpath, { id: "res-msg-" + fullpath.hashCode(), closable: true, time: 0, left: 80, top: 30 } );
	},

	showProgressUploadingFile: function( fullpath, progress )
	{
		var msg = NotifyModule.get( "res-msg-" + fullpath.hashCode() );
		if(msg)
			msg.setProgress( progress );
	},

	showEndUploadingFile: function( fullpath )
	{
		var msg = NotifyModule.get( "res-msg-" + fullpath.hashCode() );
		if(!msg)
			return;
		msg.content.style.backgroundColor = "rgba(100,200,150,0.5)";
		msg.kill(500);
	},

	showErrorUploadingFile: function( fullpath, error )
	{
		var msg = NotifyModule.get( "res-msg-" + fullpath.hashCode() );
		if(!msg)
			return;
		msg.content.style.backgroundColor = "rgba(200,100,100,0.5)";
		msg.kill(1000);
		LiteGUI.alert( error, { title: "Error uploading file" } );
	},

	onTreeUpdated: function()
	{
		this.refreshTree();
		LiteGUI.trigger( DriveModule, "tree_updated", this.tree );
	},

	refreshTree: function()
	{
		//this.resources_panel.refreshTree();
	},

	refreshContent: function()
	{
		this.resources_panel.refreshContent();
		/*
		if( this.current_bridge )
			this.current_bridge.updateContent( this.current_folder );
		else
			this.showInBrowserContent( this.visible_resources );
		*/
	},

	showInBrowserContent: function( items, options )
	{
		this.resources_panel.showInBrowserContent( items, options );
	},

	updateServerTreePanel: function(callback)
	{
		for(var i in this.registered_drive_bridges)
		{
			var bridge = this.registered_drive_bridges[i];
			if( bridge && bridge.updateTree )
				bridge.updateTree(function() {
					DriveModule.onTreeUpdated();
				});
		}
	},

	showMemoryResources: function()
	{
		this.current_folder = null;
		this.current_bridge = null;
		this.resources_panel.showInBrowserContent( LS.ResourcesManager.resources );
	},

	selectFolder: function( fullpath )
	{
		this.resources_panel.tree_widget.setSelectedItem( fullpath, true, true );
	},

	getFilename: function(fullpath)
	{
		var pos = fullpath.indexOf("?");
		if(pos != -1)
			fullpath = fullpath.substr(0,pos); //remove params
		pos = fullpath.lastIndexOf("/");
		if(pos == -1) 
			return fullpath;
		return fullpath.substr(pos+1);
	},

	getExtension: function (filename)
	{
		var pos = filename.lastIndexOf(".");
		if(pos == -1)
			return "";
		return filename.substr(pos+1).toLowerCase();
	},	

	getDriveBridgeFromFullpath: function( fullpath )
	{
		if(!fullpath)
			return null;
		for(var i in this.registered_drive_bridges)
		{
			var bridge = this.registered_drive_bridges[i];
			if( bridge.isPath && bridge.isPath( fullpath ) )
				return bridge;
		}
		return null;
	},

	/*
	filterResources: function(type)
	{
		//if(!this.dialog) return;

		//var parent = $("#dialog_resources-browser .resources-container ul.file-list")[0];
		var parent = this.root.querySelector(".resources-container ul.file-list");

		$(parent).find(".resource").show();
		if(!type)
		{
			$(parent).find(".resource").show();
			return;
		}

		$(parent).find(".resource").hide();
		$(parent).find(".resource-" + type).show();
	},

	filterResourcesByName: function(text)
	{
		//if(!this.dialog) return;

		//var parent = $("#dialog_resources-browser .resources-container ul.file-list")[0];
		var parent = this.root.querySelector(".resources-container ul.file-list");

		$(parent).find(".resource").show();
		if(!text)
		{
			$(this.dialog).find(".resource").show();
			return;
		}

		var res = $(parent).find(".resource");
		$.each(res, function(i,e) {
			if( e.dataset["filename"].indexOf(text) == -1 )
				$(e).hide();
			else
				$(e).show();
		});
	},
	*/

	showUploadDialog: function(resource)
	{

	},

	showResourceInfoInDialog: function( resource )
	{
		var dialog = new LiteGUI.Dialog( null, { title:"Properties", fullcontent: true, closable: true, draggable: true, detachable: true, minimize: true, resizable: true, width: 400, height: 500, scroll: true });
		var inspector = new LiteGUI.Inspector();
		dialog.add( inspector );
		this.showResourceInfo( resource, inspector );
		dialog.on_close = function()
		{

		}
		dialog.show();
		return dialog;
	},

	showResourceInfo: function( resource, inspector )
	{
		if(!resource)
			return;

		var fullpath = null;

		if(resource.constructor === String)
			fullpath = resource;
		else
			fullpath = resource.fullpath || resource.filename;

		var local_resource = LS.ResourcesManager.resources[ fullpath ];
		var server_resource = DriveModule.server_resources[ fullpath ];
		var resource = local_resource || server_resource;
		if(!resource)
			return;

		var preview_url = resource.preview_url || LFS.getPreviewPath( fullpath );
		var category = resource.category || resource.object_type;

		if(!inspector)
		{
			inspector = InterfaceModule.inspector_widget.inspector;
			InterfaceModule.inspector_widget.setTitle("Resource");
			inspector.clear();
		}

		inspector.addTitle("Resource");
		inspector.addString("Fullpath", resource.fullpath, {disabled:true} );

		if(preview_url)
		{
			var img = new Image();
			img.src = preview_url;
			img.className = "preview_image";
			img.onerror = function(){ this.parentNode.removeChild(this); }

			var img_container = inspector.addInfo(null, img);
			var preview_image = inspector.root.querySelector(".preview_image");
			img_container.style.backgroundColor = "black";
			img_container.style.textAlign = "center";
		}

		var filename = resource.filename;
		if(!filename && server_resource)
			filename = server_resource.filename;

		inspector.addString("Filename", filename, { callback: function(v) { 
			//rename
			DriveModule.renameResource( resource.filename, v, resource );
			DriveModule.refreshContent();
		}});
		inspector.addFolder("Folder", resource.folder || "", { disabled: true, callback: function(v) {
			var newname = v + "/" + LS.ResourcesManager.getFilename( resource.filename );
			DriveModule.renameResource( resource.filename, newname );
		}});

		inspector.addString("Category", category, { callback: function(v) {
			resource.category = v;
		}});

		if( resource.size )
			inspector.addInfo("Size", DriveModule.beautifySize( resource.size ) );

		if(resource.metadata && typeof(resource.metadata) == "object")
		{
			inspector.addTextarea("Description",resource.metadata["description"] , { callback: function(v) { 
				resource.metadata["description"] = v;
			}});

			var metadata = "";
			for(var i in resource.metadata)
			{
				if(i != "description")
					metadata += "<p style='padding:0'><strong>"+i+"</strong>: " + resource.metadata[i] + "</p>\n";
			}
		}

		inspector.addSeparator();

		if(resource._original_data || resource._original_file)
		{
			var data = resource._original_data || resource._original_file;
			if(data.buffer)
				data = data.buffer;

			var bytes = 0;
			if(typeof(data) == "string")
				bytes = data.length;
			else if(data.constructor == ArrayBuffer)
				bytes = data.byteLength;

			inspector.addInfo("Bytes", DriveModule.beautifySize( bytes ) );
		}

		inspector.addInfo("Metadata", metadata, {height:50});
		var link = resource.url;
		if(!link && resource.fullpath)
			link = LS.ResourcesManager.getFullURL( resource.fullpath );

		if(category == "Prefab" && local_resource)
			inspector.addButton("Prefab","Show content", function(){ DriveModule.showPrefabContent(local_resource); });

		if(link)
			inspector.addInfo("Link", "<a target='_blank' href='"+link+"'>link to the file</a>" );
		/*
		inspector.addButton("Show", "Open Window", { callback: function(){
			var new_window = window.open("","Visualizer","width=400, height=300");
			if(resource.appendChild) //is HTML element
				new_window.document.body.appendChild( resource );
			else
			{
				var image = new Image();
				image.src = resource.path;
				new_window.document.body.appendChild( image );
			}
		}});
		*/

		inspector.addSeparator();

		inspector.addButtons(null,["Update Preview","Update metadata"], { callback: function(v) {
			var local_resource = LS.ResourcesManager.getResource( resource.fullpath );
			if(!local_resource)
			{
				LiteGUI.alert("You must load the resource before updating it");
				return;
			}

			if(v == "Update Preview")
			{
				//update image
				var url = DriveModule.generatePreview( resource.fullpath, true );
				preview_image.src = url;
				resource.preview_url = url;
				//upload it in case is a server side file
				DriveModule.onUpdatePreview(resource, function() {
					console.log("updated!");
					//preview.src = resource.preview_url;
				});
			}
			else if(v == "Update metadata")
			{
				if(resource.generateMetadata)
				{
					resource.generateMetadata();
					//
				}
			}
		}});

		inspector.addButtons(null,["Load","Unload"], {callback: function(v){
			var restype = resource.category || resource.object_type;
			if(v == "Load")
				DriveModule.loadResource(resource.fullpath,restype);
			else
			{
				DriveModule.unloadResource(resource.fullpath);
				DriveModule.refreshContent();
			}
		}});

		/*
		if(resource.fullpath)
			inspector.addButton(null,"Open in Code Editor", {callback: function(v){
				
			}});
		*/

		inspector.addButtons(null,["Save","Delete"], {callback: function(v){
			if (v == "Save")
			{
				//var res = LS.ResourcesManager.resources[resource.fullpath];
				if(!resource.fullpath)
					return LiteGUI.alert("Resource must have a folder assigned");
				DriveModule.saveResource( resource );
				return;
			}

			LiteGUI.confirm("Are you sure?", function() {

				if (v == "Delete")
				{
					DriveModule.serverDeleteFile(resource.fullpath, function(v) { 
						if(v)
							DriveModule.refreshContent();
					});
				}
			});
		}});
	},

	showNewResourceDialog: function()
	{
		var dialog = new LiteGUI.Dialog( null, { title:"New Resource", fullcontent: true, closable: true, draggable: true, detachable: true, minimize: true, resizable: true, width: 300, height: 300, scroll: true });
		var inspector = new LiteGUI.Inspector();
		dialog.add( inspector );

		var valid_types = ["Text","Script"];
		var type = valid_types[0];
		var filename = "unknown.txt";

		inspector.on_refresh = function()
		{
			inspector.clear();
			inspector.addCombo("Type", type, { values: valid_types, callback: function(v){
				type = v;
				//inspector.refresh();
			}});

			inspector.addString("Filename",filename, function(v){
				filename = v;
			});

			inspector.addButtons(null,["Create","Cancel"], function(v){
				if(v == "Cancel")
				{
					dialog.close();
					return;
				}
				if(v == "Create")
				{
					//TODO
					LiteGUI.alert("Feature not finished");
					dialog.close();
				}
			});

			dialog.adjustSize();
		}

		inspector.refresh();

		dialog.on_close = function()
		{

		}
		dialog.show();
		return dialog;
	},

	renameResource: function( old_name, new_name, resource )
	{
		//HARDCODED WITH LFS
		if(resource && resource.fullpath)
		{
			//rename in server
			console.log("Renaming server file");
			console.log(resource);	
			old_name = resource.fullpath;
			new_name = LFS.getFullpath( resource.unit, resource.folder, new_name );
			this.serverMoveFile( old_name, new_name, function(){
				DriveModule.refreshContent();
			});
		}

		var res = LS.ResourcesManager.resources[ old_name ];
		if(!res)
			return;
		LS.ResourcesManager.renameResource( old_name, new_name ); //rename and inform
		//res.filename = new_name;
		//LS.ResourcesManager.registerResource(new_name, res);
	},

	showSelectFolderDialog: function(callback, callback_close, default_folder )
	{
		this.serverGetFolders( inner );

		function inner( tree_data )
		{
			var data = DriveModule.convertToTree( tree_data );

			var dialog = new LiteGUI.Dialog("select-folder-dialog", {title:"Select folder", close: true, width: 360, height: 240, scroll: false, draggable: true});

			var tree_widget = new LiteGUI.Tree("files-tree", data , {allow_rename:false, height: 200} );

			tree_widget.root.style.backgroundColor = "#111";
			tree_widget.root.style.padding = "5px";
			tree_widget.root.style.width = "100%";
			tree_widget.root.style.overflow = "auto";

			dialog.add( tree_widget );
			var selected = null;

			tree_widget.root.addEventListener("item_selected", function(e) {
				var data = e.detail;
				selected = data.item.data;
			});

			dialog.addButton("Select", { className: "big", callback: function ()
			{
				if(callback)
					callback( selected ? selected.fullpath : null );
				dialog.close();
			}});


			dialog.adjustSize(20);
			dialog.show('fade');

			if(default_folder)
				tree_widget.setSelectedItem( default_folder, true );
		}
	},

	showPrefabContent: function( prefab )
	{
		var dialog = new LiteGUI.Dialog(null, {title:"Prefab content", close: true, width: 360, height: 240, draggable: true});
		var inspector = new LiteGUI.Inspector();
		inspector.addString( "Name", prefab.filename );
		var info = null;
		var list = [];
		for(var i in prefab.resources)
			list.push(i);
		inspector.addList( null, list, { height: 200, callback: function(v){
			console.log(v);
			var res = prefab.resources[v];
			if(!res)
				return;
			console.log(res);
		}});
		info = inspector.addInfo( "Info", "No info" );
		inspector.addButton(null,"Close", function(){
			dialog.close();
		});

		dialog.add( inspector );
		dialog.show();
		dialog.adjustSize();
	},

	getServerFoldersTree: function(callback)
	{
		//request folders
		this.serverGetFolders(inner);

		function inner( units )
		{
			if(!units)
			{
				if(callback) 
					callback(null);
			}

			//server root node in the list
			var server_root = { id: "Server", children:[] };
			for(var i in units)
			{
				var unit = units[i];
				var item = { id: unit.metadata.name, type:"unit", candrag: true, className: 'folder unit', fullpath: unit.name }; //ADD MORE INFO
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
				var clean_fullpath = LS.ResourcesManager.cleanFullpath( fullpath + "/" + i );
				var folder = { id: clean_fullpath, content: i, fullpath: clean_fullpath, type:"folder", candrag: true, className: 'folder', folder: i };
				if(root[i])
					folder.children = get_folders( clean_fullpath, root[i] );
				folders.push( folder );
			}
			return folders;
		}
	},

	/*
	showResourcesInFolder: function(folder, callback)
	{
		this.current_folder = folder;
		//this.showInBrowserContent(null);
		this.showLoadingBrowserContent();
		this.serverGetFiles(folder, inner.bind(this));

		function inner(data)
		{
			if(data)
			{
				var resources = {};
				for(var i = 0; i < data.length; i++)
				{
					var resource = data[i];
					resources[ resource.fullpath ] = resource;
					this.server_resources[ resource.fullpath ] = resource;
					this.server_resources_by_id[ resource.server_id ] = resource;
				}

				this.showInBrowserContent(resources);
			}
			else
				this.showInBrowserContent(null);

			if(callback) callback();
		}
	},
	*/

	showLoadingBrowserContent: function()
	{
		var parent = $(this.root).find(".resources-container")[0];
		$(parent).empty();
		$(parent).append("<strong>loading...</strong>");
	},

	//Retrieve a resource from the server and stores it for later use, it shoudnt do anything with it, just ensure is in memory.
	loadResource: function(fullpath, res_type, on_complete)
	{
		if(!LS.ResourcesManager.resources[fullpath])
		{
			LS.ResourcesManager.load(fullpath, null, function(data) { 
				if(on_complete)
					on_complete(data);
			});
		}
		else
			if(on_complete)
				on_complete( LS.ResourcesManager.resources[fullpath] );

	},

	unloadResource: function(fullpath)
	{
		if(!LS.ResourcesManager.resources[fullpath])
			return;
		LS.ResourcesManager.unregisterResource( fullpath );
	},

	//called when a resource is loaded into memory, used to fetch info from the server
	onResourceRegistered: function(resource)
	{
		var fullpath = resource.fullpath || resource.filename;
		if(!fullpath)
			return;

		if(fullpath[0] == "#") 
			return;

		//console.log("FULLPATH: \"" + fullpath + "\"",fullpath.length);

		if( this.server_resources[ fullpath ] )
		{
			resource._server_info = this.server_resources[ fullpath ];
			return;
		}

		//fetch info
		if(LoginModule.session)
			LoginModule.session.getFileInfo( fullpath, function(info) { 
				if(info)
					DriveModule.processServerResource(info); 
			});
		/*
		$.getJSON( DriveModule.server_url + "ajax.php?action=resources:getFileInfo&fullpath=" + fullpath )
		.done(function (response) {
			//change the Tree Server item
			if(response.status == 1)
			{
				DriveModule.processServerResource(response.data);
			}
		})
		.fail(function (err) {
			console.error("Error in getFileInfo: " + err.responseText );
		});
		*/
	},

	//called when clicking the "Insert in scene" button after selecting a resource
	onInsertResourceInScene: function( resource_item, options ) 
	{
		if(!resource_item)
		{
			LiteGUI.alert("No resource selected");
			return;
		}

		options = options || {};
		var fullpath = null;
		var restype = null;
		var resource = null;

		if( resource_item.dataset ) //item from the drive
		{
			fullpath = resource_item.dataset["fullpath"] || resource_item.dataset["filename"];
			restype = resource_item.dataset["restype"];
			resource = LS.ResourcesManager.getResource( fullpath );
		}
		else if( resource_item.fullpath ) //resource
		{
			resource = resource_item;
			fullpath = resource.fullpath || resource.filename;
			restype = LS.ResourcesManager.getResourceType( resource );
		}

		DriveModule.closeTab();
		LS.GlobalScene.refresh();

		//resource is not in memory
		/*
		if(!resource)
		{
			LS.ResourcesManager.load( fullpath, null, function(url,resource){ DriveModule.onInsertResourceInScene(url,resource); });
			return;
		}
		*/

		//search for function in charge or processing this file
		var found = false;
		for( var i in DriveModule.insert_resource_callbacks )
		{
			var info = DriveModule.insert_resource_callbacks[i];
			if(info[0] == restype || !info[0] )
			{
				var ret = info[1].call( DriveModule, fullpath, restype, options );
				if(ret == false)
					continue;

				found = true;
				return;
			}
		}

		if(!found)
			LiteGUI.alert("Insert not implemented for this resource type: " + LS.getObjectClassName( resource ) );

	},

	//if className is omited, it will be call with all
	registerAssignResourceCallback: function( className, callback )
	{
		if( className && className.constructor === Array )
		{
			for(var i in className)
				this.insert_resource_callbacks.push([ className[i], callback ]);
		}
		else
			this.insert_resource_callbacks.push([ className, callback ]);
	},

	//SERVER ACTIONS *************************************************

	onCreateFolderInServer: function( root_path, on_complete )
	{
		LiteGUI.prompt("Folder name", inner);
		function inner(name)
		{
			if(!name)
				return;

			var folder = root_path + "/" + name;
			DriveModule.serverCreateFolder( folder, inner_complete );
		}

		function inner_complete(v)
		{
			if(v)
				DriveModule.updateServerTreePanel();
			else
				LiteGUI.alert("Cannot be done (are you logged?)");
			if(on_complete)
				on_complete(v);
		}
	},

	onMoveFolderInServer: function( origin_fullpath, target_fullpath, on_complete )
	{
		LiteGUI.confirm("Are you sure? All projects using the files inside this folder will have broken references.", inner);
		function inner(v)
		{
			if(!v)
				return;
			LoginModule.session.moveFolder( origin_fullpath, target_fullpath, inner_complete);
		}

		function inner_complete(v)
		{
			if(v)
				DriveModule.updateServerTreePanel();
			else
				LiteGUI.alert("Cannot be done (are you logged?)");
			if(on_complete)
				on_complete(v);
		}
	},

	onDeleteFolderInServer: function( fullpath, on_complete )
	{
		LiteGUI.confirm("Are you sure you want to delete the folder? All files will be lost", inner);
		function inner(v)
		{
			if(!v)
				return;
			if(fullpath == null)
				return;
			DriveModule.serverDeleteFolder( fullpath, inner_complete );
		}

		function inner_complete(v)
		{
			if(v)
				DriveModule.updateServerTreePanel();
			else
				LiteGUI.alert("Cannot be done (are you logged?)");
			if(on_complete)
				on_complete(v);
		}
	},

	onUpdatePreview: function(resource, on_complete)
	{
		if(!resource || !resource.fullpath)
		{
			console.error("fullpath not found");
			return;
		}

		//Generate
		var preview = DriveModule.generatePreview( resource.fullpath );
		if(!preview)
			return;

		//Save
		DriveModule.serverUpdatePreview(resource.fullpath, preview, inner, inner_error );

		//after callback
		function inner(status)
		{
			if(status)
			{
				LiteGUI.alert("Preview updated");
				//force reload the thumbnail without cache
				var img = DriveModule.selected_resource.querySelector("img");
				if(img)
				{
					resource.preview_url = preview;
					img.src = preview;
				}
			}
			else
				console.error("Error updating preview");
			if(on_complete) 
				on_complete();
		}

		function inner_error(err)
		{
			LiteGUI.alert("Error updating preview");
		}
	},

	filterByCategory: function(category)
	{
		this.resources_panel.filterByCategory( category );
	},

	//returns preview in base64 format
	generatePreview: function( fullpath, force_read_from_memory, skip_screenshot )
	{
		var resource = LS.ResourcesManager.getResource( fullpath );
		if(!resource) //take from the screen (reuse old ones)
		{
			if(!skip_screenshot)
				return this.takeScreenshotUsingCache( this.preview_size,this.preview_size, fullpath );
			return null;
		}

		if( resource.updatePreview )
		{
			resource.updatePreview( this.preview_size );
			if( resource.preview_url )
				return resource.preview_url;
		}

		if( resource.toCanvas ) //careful, big textures stall the app for few seconds
		{
			console.log("Generating resource preview using a canvas: ", resource.filename );
			var canvas = resource.toCanvas(null,true,256); 
			if(canvas)
			{
				resource.preview_url = canvas.toDataURL( this.preview_format );
				return resource.preview_url;
			}
		}

		//it has an image, then downscale it
		if( resource.img && !force_read_from_memory )
		{
			var img = resource.img;
			try //avoid safety problems when no CORS enabled 
			{
				//preview
				var mini_canvas = createCanvas(this.preview_size,this.preview_size);
				ctx = mini_canvas.getContext("2d");

				if(img.height == img.width * 6) //cubemap
				{
					return RenderModule.takeScreenshot(this.preview_size,this.preview_size);
				}
				else if(img.pixels) //non-native image
				{
					var tmp_canvas = createCanvas(img.width,img.height);
					var tmp_ctx = tmp_canvas.getContext("2d");
					var tmp_pixels = tmp_ctx.getImageData(0,0,img.width,img.height);
					var channels = img.bytesPerPixel;
					var img_pixels = img.pixels;
					for(var i = 0; i*channels < img.pixels.length; i += 1)
						tmp_pixels.data.set( [ img_pixels[i*channels], img_pixels[i*channels+1], img_pixels[i*channels+2], channels == 4 ? img_pixels[i*channels+3] : 255 ], i*4);
					tmp_ctx.putImageData(tmp_pixels,0,0);
					ctx.drawImage(tmp_canvas,0,0,mini_canvas.width,mini_canvas.height);
				}
				else
					ctx.drawImage(img,0,0,mini_canvas.width,mini_canvas.height);
				return mini_canvas.toDataURL("image/png");
			}
			catch (err)
			{
				if(on_complete) on_complete(-1, "Image doesnt come from a safe source");
				return null;
			}
		}

		//a generated texture
		if( resource.constructor === GL.Texture )
		{
			var w = resource.width;
			var h = resource.height;

			if( resource.texture_type === gl.TEXTURE_CUBE_MAP )
				return RenderModule.takeScreenshot(this.preview_size,this.preview_size);


			//Read pixels form WebGL
			var buffer = resource.getPixels();
			/*
			var buffer = new Uint8Array(w*h*4);
			resource.drawTo( function() {
				try
				{
					gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,buffer);
				}
				catch (err)
				{
				}
			});
			*/

			//dump to canvas
			var canvas = createCanvas(w,h);
			var ctx = canvas.getContext("2d");
			var pixels = ctx.getImageData(0,0,w,h);
			pixels.data.set( buffer );
			ctx.putImageData( pixels,0,0 );

			//flip Y
			var final_canvas = createCanvas(this.preview_size,this.preview_size);
			var final_ctx = final_canvas.getContext("2d");
			final_ctx.translate(0,final_canvas.height);
			final_ctx.scale(1,-1);
			final_ctx.drawImage( canvas, 0, 0, final_canvas.width, final_canvas.height );

			return final_canvas.toDataURL("image/png");
		}

		//other form of resource, then do a snapshot of the viewport
		if(!skip_screenshot)
			return this.takeScreenshotUsingCache( this.preview_size, this.preview_size, fullpath );
		return null;
	},

	takeScreenshotUsingCache: function(w,h, fullpath)
	{
		var now = getTime();
		if( this._last_screenshot && (now - this._last_screenshot.time) < 2000 )
			return this._last_screenshot.data;
		console.log("Screenshot taken for resource: " + (fullpath || "") );
		var screenshot = RenderModule.takeScreenshot( w,h );
		this._last_screenshot = { time: now, data: screenshot };
		return screenshot;
	},

	fetchPreview: function( url )
	{
		var that = this;
		if(this.generated_previews[ url ])
			return;

		var path = LFS.getPreviewPath( url );
		var img = new Image();
		img.src = path;
		img.onerror = function() {
			delete that.generated_previews[ url ];
		}
		this.generated_previews[ url ] = img;
	},

	//trys to fetch one preview
	getServerPreviewURL: function( resource )
	{
		if(resource.preview_url)
			return resource.preview_url;

		resource.preview_url = LFS.getPreviewPath( resource.fullpath );
		return resource.preview_url;
	},

	//called when the resource should be saved (after modifications)
	//no path is passed because all the info must be inside (including fullpath)
	saveResource: function(resource, on_complete, options)
	{
		options = options || {};
		if(!resource)
		{
			console.error("DriveModule.saveResource: error, resource is null");
			return;
		}

		if(!resource.fullpath)
		{
			console.error("DriveModule.saveResource: fullpath is null");
			return;
		}

		//used to change between upload or update (incase the file exist)
		//var func_name = resource._server_info ? "serverUpdateResource" : "serverUploadResource";

		//uploading dialog...
		var dialog = LiteGUI.alert("<p>Uploading file... <span class='upload_progress'></span></p>");
		var upload_progress = dialog.root.querySelector(".upload_progress");
		this.serverUploadResource( resource, resource.fullpath,
			function(v, msg) { 
				if(v)
					LS.ResourcesManager.resourceSaved( resource );
				LiteGUI.remove( upload_progress ); 
				dialog.close();
				if(!options.skip_alerts)
					LiteGUI.alert( v ? "Resource saved" : "Problem saving the resource: " + msg);
				if(on_complete)
					on_complete( resource );
			},
			function (err, status) { 
				if(status == 413)
					err = "File too big";
				dialog.content.innerHTML = "Error Uploading: " + err; 
				if(on_complete) 
					on_complete(false, err);
			},
			function (progress) { 
				upload_progress.innerHTML = ((progress*100)|0) + "%";
			}
		);
	},

	viewResource: function( resource )
	{
		var url = resource.url;
		if(!url)
			url = LS.ResourcesManager.getFullURL( resource.filename );
		window.open(url,'_blank');
	},

	//called after the server gets a file info
	processServerResource: function(data)
	{
		var resource = data;
		
		resource.id = parseInt(resource.id);
		resource.fullpath = resource.folder + "/" + resource.filename;
		resource.url = DriveModule.server_url + "resources/" + resource.fullpath;
		resource.object_type = resource.category;
		if(resource.metadata)
			resource.metadata = JSON.parse( resource.metadata );
		else
			resource.metadata = {};
		resource.preview_url = DriveModule.server_url + "resources/_pics/_" + resource.id + ".png";

		this.server_resources[ resource.fullpath ] = resource;
		if( LS.ResourcesManager.resources[ resource.fullpath ] )
			LS.ResourcesManager.resources[ resource.fullpath ]._server_info = resource;

		return resource;
	},

	convertToTree: function( data, fullpath )
	{
		fullpath = fullpath || "";

		if(!data)
			return {};

		var o = { children:[] };

		if( data.constructor == Array ) //root node
		{
			o.id = "Files";
			for( var i = 0; i < data.length; ++i )
			{
				var name = data[i].name
				var item_fullpath = fullpath + "/" + name;
				var folders = this.convertToTree( data[i].folders, item_fullpath );
				folders.content = name;
				folders.id = item_fullpath;
				folders.fullpath = item_fullpath;
				o.children.push( folders );
			}
		}
		else {
			for( var i in data )
			{
				var item_fullpath = fullpath + "/" + i;
				var folder = this.convertToTree( data[i], item_fullpath );
				folder.content = i;
				folder.id = item_fullpath;
				folder.fullpath = item_fullpath;
				o.children.push( folder );
			}
		}

		return o;
	},

	//**** SERVER CALLS **************
	serverGetFolders: function(on_complete)
	{
		var that = this;
		if(!LoginModule.session)
			throw("Session not found");
		LoginModule.session.getUnitsAndFolders(function(units){
			that.units = units;
			if(on_complete)
				on_complete(units);
		});
	},

	serverGetFiles: function(folder, on_complete)
	{
		var that = this;
		if(!LoginModule.session)
			throw("Session not found");

		LoginModule.session.getFilesByPath( folder, function(files){
			if(on_complete)
				on_complete(files);
		});
	},

	serverSearchFiles: function(filter, on_complete)
	{
		var that = this;
		if(!LoginModule.session)
			throw("Session not found");

		if(!filter || typeof(filter) != "object")
			throw("filter must be object");

		if(filter.category)
			LoginModule.session.searchByCategory( filter.category, inner );
		else if(filter.filename)
			LoginModule.session.searchByFilename( filter.filename, inner );

		function inner( files ){
			if(on_complete)
				on_complete(files);
		}
	},

	serverMoveFile: function( fullpath, new_fullpath, on_complete )
	{
		LoginModule.session.moveFile( fullpath, new_fullpath, on_complete );
	},

	serverDeleteFile: function(fullpath, on_complete)
	{
		LoginModule.session.deleteFile( fullpath, on_complete );
	},

	//Takes into account if the file is already uploaded
	//TODO: this functions goes directly to LiteFileSystem, make it more generic
	serverUploadResource: function( resource, fullpath, on_complete, on_error, on_progress )
	{
		var filename = resource.filename;

		if( resource.in_server && LS.ResourcesManager.resources[ fullpath ] )
			resource = LS.ResourcesManager.resources[ fullpath ];

		//in case we update info of a file we dont have in memory
		if( resource.in_server && !LS.ResourcesManager.resources[ fullpath ] )
		{
			var info = {};

			if(resource.metadata !== undefined)
				info.metadata = resource.metadata;
			if(resource.category !== undefined)
				info.category = resource.category;

			//update info like filename, category and metadata (and maybe preview)
			LoginModule.session.updateFileInfo( fullpath, info, 
				function(v,resp){ //on_complete
					console.log("updated!");
					if(on_complete)
						on_complete(v, fullpath, resp);
				},
				function(err,resp){ //on_error
					console.log(err);
					if(on_error)
						on_error(err);
				});
			return;
		}

		var extra_info = {
			metadata: {},
			category: resource.object_type || LS.getObjectClassName(resource)
		};

		var extension = getExtension( filename );

		//get the data
		var internal_data = LS.Resource.getDataToStore( resource );
		var data = internal_data.data;
		if(data.data) //HACK, ugly, but sometimes returns an object with info about the file, but I want the data
			data = data.data;
		if( internal_data.extension && internal_data.extension != extension )
		{
			filename += "." + internal_data.extension;
			fullpath += "." + internal_data.extension;;
		}

		extension = getExtension( filename ); //recompute it in case it changed
		//if the file doesnt have an extension...
		if( !extension )
		{
			var ext = "";
			if( data.constructor == ArrayBuffer || data.constructor == Blob || data.constructor == File )
				ext = ".wbin"; //add binary extension
			else
				ext = ".txt"; //add text
			filename += ext;
			fullpath += ext;
		}

		//in case it was changed
		resource.filename = filename;

		//generate preview
		if(resource.constructor.hasPreview !== false)
		{
			if( resource.preview_url && resource.preview_url.substr(0,11) == "data:image/" )
				extra_info.preview = resource.preview_url;
			else
				extra_info.preview = this.generatePreview( resource.fullpath );
		}

		LoginModule.session.uploadFile( fullpath, data, extra_info, 
			function(v,resp){ //on_complete
				console.log("uploaded!");
				if(on_complete)
					on_complete(v, fullpath, resp);
			},
			function(err,resp){ //on_error
				console.log(err);
				if(on_error)
					on_error(err);
			},
			function(v){ //on_progress
				//console.log("Progress",v);
				if(on_progress)
					on_progress(v);
		});

		function getExtension(filename)
		{
			var pos = filename.lastIndexOf(".");
			if(pos == -1) return "";
			return filename.substr(pos+1).toLowerCase();
		}
	},

	//QUARANTINE

	serverUpdatePreview: function( fullpath, preview, on_complete, on_error)
	{
		console.warn("Quarantine method");
		LoginModule.session.updateFilePreview( fullpath, preview, on_complete, on_error);
	},

	serverCreateFolder: function(name, on_complete)
	{
		console.warn("Quarantine method");
		if(!name)
			return;
		LoginModule.session.createFolder( name, function(v,resp){
			if(on_complete)
				on_complete(v);
		});
	},

	serverDeleteFolder: function(name, on_complete)
	{
		console.warn("Quarantine method");
		if(!name)
			return;
		LoginModule.session.deleteFolder( name, function(v,resp){
			if(on_complete)
				on_complete(v);
		});
	},

	//OVERWRITES THE FUNCTION IN EditorModule
	showSelectResource: function( options )
	{
		options = options || {};

		var last_tab = LiteGUI.main_tabs.getCurrentTab();
		DriveModule.openTab();
		LiteGUI.Dialog.hideAll();
		var visibility = InterfaceModule.getSidePanelVisibility();
		InterfaceModule.setSidePanelVisibility(false);
		if(options.type)
			DriveModule.resources_panel.filterByCategory( options.type );

		DriveModule.resources_panel.on_resource_selected_callback = function( filename ) {
			InterfaceModule.setSidePanelVisibility( visibility );
			if(options.on_complete)
				options.on_complete(filename);
			if(filename && !options.skip_load)
				LS.ResourcesManager.load( filename, null, options.on_load );
			LiteGUI.Dialog.showAll();
			LiteGUI.main_tabs.selectTab( last_tab.id );
		}
	},

	beautifySize: function ( bytes )
	{
		bytes = parseInt( bytes );
		if(bytes > 1024*1024)
			bytes = (bytes / (1024*1024)).toFixed(1) + " <span class='bytes'>MBs</span>";
		else if(bytes > 1024)
			bytes = (bytes / 1024).toFixed() + " <span class='bytes'>KBs</span>";
		else
			bytes += " <span class='bytes'>bytes</span>";
		return bytes;
	}
};

CORE.registerModule( DriveModule );


//Resource Insert button ***********************************
DriveModule.registerAssignResourceCallback( "Mesh", function( fullpath, restype, options ) {

	DriveModule.loadResource( fullpath, restype );

	var action = options.mesh_action || "replace";

	var node = null;
	if( action == "replace" && options.node )
	{
		node = options.node;
		var component = node.getComponent( LS.Components.MeshRenderer );
		if(!component)
		{
			component = new LS.Components.MeshRenderer();
			node.addComponent( component );
			component.mesh = fullpath;
		}
		else
			component.mesh = fullpath;
	}
	else
	{
		if( action == "replace") //to prioritize
			action = "plane";

		//create new node
		node = LS.newMeshNode( LS.GlobalScene.generateUniqueNodeName(), fullpath );
		EditorModule.getAddRootNode().addChild( node );

		if( options.event )
		{
			//test collision with grid
			GL.augmentEvent( options.event );
			var position =  null;
			if( action == "plane")
				position = RenderModule.testGridCollision( options.event.canvasx, options.event.canvasy );
			if(position)
				node.transform.position = position;
		}
	}

	SelectionModule.setSelection( node );
});

DriveModule.registerAssignResourceCallback(["Texture","image/jpg","image/png"], function( fullpath, restype, options ) {

	var node = LS.GlobalScene.selected_node;

	var action = options.texture_action || "material";

	if(options.event)
	{
		GL.augmentEvent(options.event);
		node = RenderModule.getNodeAtCanvasPosition( options.event.canvasx, options.event.canvasy );
	}
	
	DriveModule.loadResource( fullpath, restype );

	if( action == "replace" || action == "material" )
	{
		var channel = options.channel || LS.Material.COLOR_TEXTURE;
		if( node )
		{
			if(!node.material)
				node.material = new LS.StandardMaterial();
			var material = node.getMaterial();
			var channels = material.getTextureChannels();
			if( channels.indexOf( channel ) == -1 )
				channel = channels[0];
			material.setTexture( channel , fullpath );
		}
	}
	else if(action == "sprite")
	{
		node = new LS.SceneNode();
		var component = new LS.Component.Sprite();
		node.addComponent( component );
		EditorModule.getAddRootNode().addChild( node );
	}

	EditorModule.inspect( node );
});

//Materials
DriveModule.onInsertMaterial = function(fullpath, restype, options ) 
{
	var node = LS.GlobalScene.selected_node;

	//class not supported?
	if(!LS.MaterialClasses[restype])
		return false;

	if( options.event )
	{
		GL.augmentEvent( options.event );
		node = RenderModule.getNodeAtCanvasPosition( options.event.canvasx, options.event.canvasy );
	}

	DriveModule.loadResource( fullpath, restype, function(material) { 
		LS.ResourcesManager.resources[fullpath] = material; //material in Material format (textures and all loaded)

		EditorModule.inspect( node );
	});

	if( node )
	{
		node.material = fullpath;
		EditorModule.inspect( node );
	}
};

DriveModule.registerAssignResourceCallback( null, DriveModule.onInsertMaterial );

/*
DriveModule.registerAssignResourceCallback("SceneNode", function(fullpath, restype, resource_item) {
	//prefab
	DriveModule.loadResource(fullpath, restype, function(data) { 
		var node = new LS.SceneNode();
		node.configure(data);
		LS.ResourcesManager.loadResources( node.getResources({}) );

		Scene.root.addChild(node);
		EditorModule.inspect(node);
	});
});
*/

DriveModule.registerAssignResourceCallback( "SceneTree", function( fullpath, restype, options ) {

	LiteGUI.confirm("Are you sure? you will loose the current scene", function(v) {
		LS.GlobalScene.clear();
		LS.GlobalScene.load( LS.ResourcesManager.path + fullpath, function( scene, url ){
			scene.extra.folder = LS.ResourcesManager.getFolder( fullpath );
			scene.extra.fullpath = fullpath;
		});
		DriveModule.closeTab();
	});
});

DriveModule.registerAssignResourceCallback("Prefab", function( fullpath, restype, options ) {

	var position = null;
	if(options.event)
	{
		//test collision with grid
		GL.augmentEvent( options.event );
		position = RenderModule.testGridCollision( options.event.canvasx, options.event.canvasy );
	}

	//prefab
	DriveModule.loadResource( fullpath, restype, function(resource) { 
		//console.log(resource); //log
		var node = resource.createObject();
		LS.GlobalScene.root.addChild(node);
		if(position)
			node.transform.position = position;
		EditorModule.inspect( node );
	});
});

//generic unknown resource
DriveModule.registerAssignResourceCallback(["Resource","application/javascript","text/plain","text/csv"], function( fullpath, restype, options ) {

	var resource = LS.RM.getResource( fullpath );
	if(!resource)
	{
		LS.ResourcesManager.load( fullpath, null, function(url,resource){ DriveModule.onInsertResourceInScene(url,resource); });
		return;
	}

	if(resource)
	{
		var extension = LS.RM.getExtension( fullpath );
		var lang = "text";
		if( extension == "json" || extension == "js")
			lang = "javascript";
		var title = LS.ResourcesManager.getFilename( fullpath );
		CodingModule.editInstanceCode( resource, { title: title, lang: lang }, true );
	}
	else
		console.warn("Assigning resource without loading it");

	/*
	//prefab
	DriveModule.loadResource( fullpath, restype, function(resource) { 
		console.log(resource); //log
		CodingModule.editInstanceCode( resource, { lang: "text" }, true );
	});
	*/
});


LiteGUI.Inspector.prototype.addFolder = function( name,value, options )
{
	options = options || {};

	var old_callback_button = options.callback_button;
	options.callback_button = function(){
		//show dialog with folders
		DriveModule.showSelectFolderDialog(function(v){
			w.setValue( v );	
		}, null, w.getValue() );
	}

	w = this.addStringButton( name, value, options )

	return w;
}

LiteGUI.Inspector.widget_constructors["folder"] = "addFolder";


