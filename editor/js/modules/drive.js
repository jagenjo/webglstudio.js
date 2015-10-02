/* This module allow to browse the resources (in memory, local or in the repository) 
	TODO: Local repository uses IndexedDB to store the files Blobs
*/

var DriveModule = {
	name: "Drive",
	bigicon: "imgs/tabicon-drive.png",

	server_url: "",

	registered_drive_bridges: {},

	tree: { id:"Files", skipdrag:true, children:[ {id:"Memory", skipdrag:true, className:"memory", children:[], callback: function() { DriveModule.showMemoryResources(); return true; } } ]},

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

	on_resource_selected_callback: null, //callback to catch when a resource is selected
	selected_resource: null, //seletec item in the browser

	root: null,

	insert_resource_callbacks: [],

	init: function()
	{
		this.server_url = CORE.config.server;
		LS.ResourcesManager.setProxy( CORE.config.proxy );
		LS.ResourcesManager.keep_files = true;
		var that = this;

		//Notifications when loading
		LEvent.bind( LS.ResourcesManager, "resource_registered", function() {
			if( that.current_folder == null ) //loaded
				that.showInBrowserContent( LS.ResourcesManager.resources );
		});

		LEvent.bind( LS.ResourcesManager, "resource_loading", function( e, url ) {
			CanvasConsole.sendMessage("FILE: " + url, 0, { id: "res-msg-" + url.hashCode(), closable: true } );
		});

		LEvent.bind( LS.ResourcesManager, "resource_loaded", function(e, url) {
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

		//initGUI **********************
		LiteGUI.menubar.add("Window/Resources", { callback: DriveModule.openTab.bind(this) });

		this.tab = LiteGUI.main_tabs.addTab( this.name, {id:"drivetab", bigicon: this.bigicon, size: "full", content:"", 
			callback: function(tab){
				InterfaceModule.setSidePanelVisibility(true);		
				InterfaceModule.sidepaneltabs.selectTab("Inspector");
			},
			callback_leave: function(tab) {
				if(DriveModule.on_resource_selected_callback)
					DriveModule.onResourceSelected(null);
			}
		});
		this.root = $(LiteGUI.main_tabs.root).find("#drivetab")[0];

		LEvent.bind(ResourcesManager,"resource_registered",function(e,res) { 
			DriveModule.onResourceRegistered(res); 
		});

		//keep original files to store on server
		ResourcesManager.keep_original = true;

		//use this component to select resources
		EditorModule.showSelectResource = DriveModule.showSelectResource;

		this.createWindow(); //creates tree too

		var that = this;
		//fetch content
		$(LoginModule).bind("user-login", function(){
			that.updateServerTreePanel();
			that.showInBrowserContent();
		});
	},

	createWindow: function()
	{
		var resources_area = this.root;
		var that = this;

		var area = new LiteGUI.Area("resarea",{content_id:""});
		resources_area.appendChild(area.root);
		area.split("horizontal",[300,null],true);

		//TREE
		this.treetop_widget = new LiteGUI.Inspector("resources-treetop-widgets",{name_width: 0, one_line: true });
		this.treetop_widget.addCombo(null,"Folders", { width: 120, values: ["Folders","Categories"], callback: function(){
		}});
		this.treetop_widget.addButton(null,"Refresh", { width: 70, callback: function(){
			DriveModule.updateServerTreePanel();
		}});
		area.sections[0].content.appendChild( this.treetop_widget.root );

		//tree widget
		var tree_widget = this.createTreeWidget();
		area.sections[0].content.appendChild( tree_widget.root );

		//top bar
		var filter_string = "";
		this.top_widget = new LiteGUI.Inspector("resources-top-widgets", { one_line: true });
		this.top_widget.addString("Filter by","",{ callback: function(v) { 
			filter_string = v;
			DriveModule.filterResourcesByName(filter_string);
		}});

		this.top_widget.addSeparator();
		this.top_widget.addButton(null,"Insert in scene", { callback: DriveModule.onInsertResourceInScene });
		this.top_widget.addButton(null,"From URL", { callback: DriveModule.onUseProxyResource });

		//resources container (browser)
		var res_root = area.sections[1].content;
		$(res_root).append(this.top_widget.root);
		$(res_root).append("<div class='resources-container' style='height: calc(100% - 50px); height: -webkit-calc(100% - 50px); overflow: auto'></div>");

		//add drop action to automatically upload to server
		var drop_zone = res_root.querySelector(".resources-container");
		ImporterModule.addFileDropArea(drop_zone, this.onFileDropInBrowser.bind(this) );
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

	//user drags a file into the browser area -> gets uploaded inmediately (according to the bridge)
	onFileDropInBrowser: function(evt)
	{
		var drop_zone = evt.currentTarget;

		var current_folder = this.current_folder;
		var bridge = this.current_bridge;
		if(!bridge || !bridge.uploadFile)
			return false;

		var exp = /[^a-zA-Z0-9]/g;

		//for every file dropped
		if(evt.dataTransfer.files.length)
		{
			for(var i = 0; i < evt.dataTransfer.files.length; i++)
			{
				var file = evt.dataTransfer.files[i];
				var fullpath = current_folder + "/" + file.name;

				//guess a category
				var category = this.guessCategoryFromFile( file )
				if(!category)
				{
					console.log("Category cannot be found: " + file.name );
					continue;
				}

				//create a place holder element of the file in the files-browser
				var element = document.createElement("li");
				var safe_id = fullpath.replace( exp , "_");
				element.className = "resource file-item file-loading-" + safe_id;
				element.innerHTML = "<span class='progress'></span><span class='title'>"+file.name+"</span>";
				drop_zone.querySelector("ul").appendChild(element);

				file.category = category;

				//call the bridge to upload the file
				bridge.uploadFile(fullpath, file, function( fullpath, preview_url){
						//mark as finished uploading
						var safe_id = fullpath.replace( exp , "_");
						var item = drop_zone.querySelector(".file-loading-" + safe_id + " .progress");
						if(item)
						{
							item.style.backgroundColor = "transparent";
							item.innerHTML = "<img src='" + preview_url + "'/>";
						}
					}, function(err){
						//in case of error
						var safe_id = fullpath.replace( exp , "_");
						var item = drop_zone.querySelector(".file-loading-" + safe_id + " .progress");
						if(item)
						{
							item.backgroundColor = "red";
							item.style.height = "100%";
						}
					}, function(v, fullpath){
						//show progress
						var safe_id = fullpath.replace( exp , "_");
						var item = drop_zone.querySelector(".file-loading-" + safe_id + " .progress");
						if(item)
							item.style.height = (v*100).toFixed() + "%";
				});
			}//for
		}
		else if( evt.dataTransfer.items.length )
		{
			var url = evt.dataTransfer.getData("text/uri-list");
			if(url)
			{
				var file_info = LFS.parsePath(url);
				var target_fullpath = current_folder + "/" + file_info.filename;

				bridge.uploadRemoteFile( url, target_fullpath, function(v){
					//refresh tab?
				});
			}
		}

		evt.preventDefault();
		evt.stopPropagation();
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
		this.registered_drive_bridges[ bridge.name ] = bridge;
		bridge.tree_root = { id: bridge.name , skipdrag:true, className: bridge.className, children:[], bridge: bridge };
		this.tree.children.unshift( bridge.tree_root );
	},

	getDriveBridge: function(name)
	{
		return this.registered_drive_bridges[ name ];
	},

	createTreeWidget: function()
	{
		var tree_widget = new LiteGUI.Tree("resources-tree",this.tree, {allow_rename:true} );
		tree_widget.root.classList.add("resources-tree");
		tree_widget.root.style.backgroundColor = "black";
		tree_widget.root.style.padding = "5px";
		tree_widget.root.style.width = "calc( 100% - 10px )";
		tree_widget.root.style.height = "calc( 100% - 50px )";
		tree_widget.root.style.height = "-webkit-calc( 100% - 50px )";
		this.tree_widget = tree_widget;
		var that = this;

		this.tree_widget.onItemContextMenu = function(e)
		{
			var menu = new LiteGUI.ContextualMenu(["Create Folder","Delete Folder","Rename"], { event: e, callback: function(v) {
				if(v == "Create Folder")
					that.onCreateFolderInServer();
				else if(v == "Delete Folder")
					that.onDeleteFolderInServer();
			}});
			e.preventDefault();
			return false;
		}

		//to check if it should be moved
		/*
		this.tree_widget.onMoveItem = function(item, parent)
		{
			if(item.data.candrag && parent.data.candrag )
				return true;
			return false;
		}
		*/

		tree_widget.root.addEventListener("item_selected", function(e) {
			var info = e.detail;
			var item = info.data;

			if(item.className)
			{
				if(item.bridge && item.bridge.onFolderSelected)
					item.bridge.onFolderSelected(item);
			}
		});

		tree_widget.root.addEventListener("drop_on_item", function(e) {

			var item = e.detail.item;
			var drop = e.detail.event;

			var folder_element = item.parentNode.data;
			var folder_fullpath = folder_element.fullpath;

			var bridge = folder_element.bridge;
			if(!bridge || !bridge.onDropInFolder)
				return;

			bridge.onDropInFolder( folder_fullpath, drop );
		});

		tree_widget.root.addEventListener("item_renamed", function(e)	{
			var info = e.detail;
			//old_name, new_name, item
			//TODO
		});

		/*
		tree_widget.root.addEventListener("item_moved", function(e)
		{
			var data = e.detail;
			var item = data.item;
			var parent_item = data.parent_item;

			//console.log(item.data, parent_item.data);
			var origin = item.data.fullpath;
			var target = parent_item.data.fullpath;
			//WRONG!! target must be parent + "/" + last_part_folder
			//that.onMoveFolderInServer( origin, target );
		});
		*/

		return tree_widget;
	},

	refreshTree: function()
	{
		this.tree_widget.updateTree( this.tree );
	},

	refreshContent: function()
	{
		if( this.current_bridge )
			this.current_bridge.updateContent( this.current_folder );
		else
			this.showInBrowserContent( this.visible_resources );
	},

	uploadAndShowProgress: function( resource, folder_fullpath, callback )
	{
		if(!folder_fullpath)
			return;

		/*	
		resource.folder = folder_fullpath;
		var final_fullpath = folder_fullpath;
		if( folder_fullpath.length && folder_fullpath[ folder_fullpath.length - 1 ] != "/") //add slash
			final_fullpath += "/";
		final_fullpath += resource.filename;
		*/

		var dialog = LiteGUI.alert("<p>Uploading file... <span id='upload_progress'></span>%</p>");

		var fullpath = folder_fullpath + "/" + resource.filename;

		DriveModule.serverUploadResource( resource, fullpath,
			function(v, final_fullpath) { 
				dialog.close();
				LiteGUI.alert( v ? "Resource saved" : "Problem saving the resource: " + msg);
				if(callback)
					callback(v, folder_fullpath, final_fullpath);
			},
			inner_error,
			function (progress) { 
				$("#upload_progress").html( (progress * 100).toFixed(0) );
			}
		);

		function inner_error(err, status)
		{
			if(status == 413)
				LiteGUI.alert("Error: file too big");
			else
				LiteGUI.alert("Error: file cannot be uploaded");
			console.error(err);
			if(callback)
				callback(false);
		}
	},

	updateServerTreePanel: function(callback)
	{
		for(var i in this.registered_drive_bridges)
		{
			var bridge = this.registered_drive_bridges[i];
			if( bridge && bridge.updateTree )
				bridge.updateTree(function() {
					DriveModule.tree_widget.updateTree( DriveModule.tree );
				});
		}
		/*
		this.getServerFoldersTree(inner);

		function inner( tree )
		{
			if(!tree)
			{
				DriveModule.tree.children[0].folders = [];
				if(callback) 
					callback(null);
			}

			//server root node in the list
			var bridge = DriveModule.getDriveBridge("Server");

			var server_root = bridge.tree_root;
			server_root.children = tree.children;

			//refresh tree using updated data
			DriveModule.tree_widget.updateTree( DriveModule.tree );

			if(callback) 
				callback(tree);
		}
		*/
	},

	showMemoryResources: function()
	{
		this.current_folder = null;
		this.current_bridge = null;
		this.showInBrowserContent( LS.ResourcesManager.resources );
	},

	//clear and rebuild the resources items shown in the browser screen from a list of resources
	showInBrowserContent: function( resources_container )
	{
		//var dialog = this.dialog;
		//if(!dialog) return;

		//var parent = $("#dialog_resources-browser .resources-container")[0];
		var parent = this.root.querySelector(".resources-container");
		parent.innerHTML = "";
		var root =  document.createElement("ul");
		root.className = "file-list";
		parent.appendChild( root );

		this.visible_resources = resources_container;

		if(resources_container)
			for(var i in resources_container)
			{
				var resource = resources_container[i];
				if(!resource.name)
					resource.name = i;
				this.addItemToBrowser(resource);
			}
	},

	getFilename: function(fullpath)
	{
		var pos = fullpath.lastIndexOf("/");
		if(pos == -1) 
			return fullpath;
		return fullpath.substr(pos+1);
	},

	getExtension: function (filename)
	{
		var pos = filename.lastIndexOf(".");
		if(pos == -1) return "";
		return filename.substr(pos+1).toLowerCase();
	},

	//add a new resource to the browser window
	addItemToBrowser: function(resource)
	{
		var memory_resource = LS.ResourcesManager.resources[ resource.fullpath ];

		//if(!this.dialog) return;
		//var parent = $("#dialog_resources-browser .resources-container ul.file-list")[0];
		var parent = this.root.querySelector(".resources-container ul.file-list");

		var element =  document.createElement("li");
		if(resource.id)
			element.dataset["id"] = resource.id;
		element.dataset["filename"] = resource.filename;
		if(resource.fullpath)
			element.dataset["fullpath"] = resource.fullpath;
		element.dataset["restype"] = (resource.object_type || resource.category || LS.getObjectClassName(resource));
		element.className = "resource file-item resource-" + element.dataset["restype"];
		if(resource.id)
			element.className += " in-server";
		else
			element.className += " in-client";

		if(resource._modified  || (memory_resource && memory_resource._modified) )
			element.className += " modified";

		var filename = this.getFilename( resource.filename );
		if(!filename) 
			filename = resource.fullpath;

		var type = resource.object_type || LS.getObjectClassName(resource);
		element.title = type + ": " + resource.filename;
		if(filename)
		{
			var clean_name = filename.split(".");
			clean_name = clean_name.shift() + "<span class='extension'>." + clean_name.join(".") + "</span>";
			element.innerHTML = "<span class='title'>"+clean_name+"</span>";
		}

		//REFACTOR THIS FOR GOD SAKE!!!!!!!!!!!!!!!!!!!!!!!
		var preview = resource.preview_url;
		
		if(preview)
		{
			if(typeof(preview) == "string" && preview.substr(0,11) == "data:image/")
			{
				if(this.generated_previews[ resource.fullpath ])
					preview = this.generated_previews[ resource.fullpath ];
				else
				{
					var img = new Image();
					img.src = preview;
					img.style.maxWidth = 200;
					this.generated_previews[ resource.fullpath ] = img;
					preview = img;
				}
			}
		}
		else
		{
			var filename = resource.fullpath || resource.filename;

			if(resource.in_server)
				preview = this.getServerPreviewURL( resource );
			else 
			{
				if( this.generated_previews[ filename ] )
				{
					preview = this.generated_previews[ filename ];
				}
				else if( !resource.fullpath ) //is hosted somewhere
				{
					preview = this.generatePreview( filename );
					if(preview)
					{
						var img = new Image();
						img.src = preview;
						img.style.maxWidth = 200;
						this.generated_previews[ filename ] = img;
						preview = img;
					}
				}
			}
		}

		//generate a thumbnail 
		if(preview)
		{
			if( typeof(preview) == "string") 
			{
				var img = new Image();
				img.src = preview;
				img.style.maxWidth = 200;
				img.onerror = function() { this.parentNode.removeChild( this ); }
			}
			else
				img = preview;
			element.appendChild(img);
		}
		
		$(element).append("<span class='info'>"+type+"</span>");

		/*
		var button = document.createElement("button");
		button.className = "info-button";
		button.innerHTML = "info";
		button.resource = resource;
		$(element).append(button);
		$(button).click( function() { DriveModule.showResourceDialog( this.resource ); });
		*/

		element.addEventListener("click", item_selected);
		parent.appendChild(element);

		//when the resources is clicked
		function item_selected(e)
		{
			DriveModule.selected_resource = this;
			if(!DriveModule.on_resource_selected_callback)
			{
				//$("#dialog_resources-browser .resources-container").find(".selected").removeClass("selected");
				$(parent).find(".selected").removeClass("selected");
				$(this).addClass("selected");
				DriveModule.showResourceInfo( resource );
			}
			else
			{
				var path = this.dataset["fullpath"];
				if(!path)
					path = this.dataset["filename"];
				DriveModule.onResourceSelected( path );
			}
		}

		//dragging
		element.draggable = true;
		element.addEventListener("dragstart", function(ev) {
			//trace("DRAGSTART!");
			//this.removeEventListener("dragover", on_drag_over ); //avoid being drag on top of himself
			ev.dataTransfer.setData("res-filename", resource.filename);
			if(resource.fullpath)
				ev.dataTransfer.setData("res-fullpath", resource.fullpath);
			ev.dataTransfer.setData("res-type", type);
		});
	},

	

	filterResources: function(type)
	{
		//if(!this.dialog) return;

		//var parent = $("#dialog_resources-browser .resources-container ul.file-list")[0];
		var parent = $(this.root).find(".resources-container ul.file-list")[0];

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
		var parent = $(this.root).find(".resources-container ul.file-list")[0];

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

	showUploadDialog: function(resource)
	{

	},

	showResourceInfo: function(resource)
	{
		if(!resource)
			return;

		var fullpath = resource.fullpath || resource.filename;
		var server_resource = DriveModule.server_resources[ fullpath ];
		var preview_url = resource.preview_url || LFS.getPreviewPath( resource.fullpath );

		/*
		if(!preview_url && server_resource)
			preview_url = server_resource.preview_url;
		var preview = new Image();
		if(preview_url)
			preview.src = preview_url;
		*/

		//widgets
		var widgets = InterfaceModule.inspector;
		widgets.clear();

		widgets.addTitle("Resource");
		widgets.addString("Fullpath", resource.fullpath, {disabled:true} );

		var img = new Image();
		img.src = preview_url;
		img.className = "preview_image";
		img.on_error = function(){ this.parentNode.removeChild(this); }

		widgets.addInfo(null, img);
		var preview_image = widgets.root.querySelector(".preview_image");

		var filename = resource.filename;
		if(!filename && server_resource)
			filename = server_resource.filename;

		widgets.addString("Filename", filename, { callback: function(v) { 
			//rename
			DriveModule.renameResource( resource.filename, v );
			DriveModule.refreshContent();
		}});
		widgets.addFolder("Folder", resource.folder || "", { disabled: true, callback: function(v) {
			var newname = v + "/" + LS.ResourcesManager.getFilename( resource.filename );
			DriveModule.renameResource( resource.filename, newname );
		}});

		widgets.addString("Category", resource.category || resource.object_type, { callback: function(v) {
			resource.category = v;
		}});

		if(resource.metadata && typeof(resource.metadata) == "object")
		{
			widgets.addTextarea("Description",resource.metadata["description"] , { callback: function(v) { 
				resource.metadata["description"] = v;
			}});

			var metadata = "";
			for(var i in resource.metadata)
			{
				if(i != "description")
					metadata += "<p style='padding:0'><strong>"+i+"</strong>: " + resource.metadata[i] + "</p>\n";
			}
		}

		widgets.addSeparator();

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

			if(bytes > 1024*1024) bytes = (bytes / (1024*1024)).toFixed(1) + " MBs";
			else if(bytes > 1024) bytes = (bytes / 1024).toFixed() + " KBs";
			else bytes += " bytes";

			widgets.addInfo("Bytes", bytes );
		}

		widgets.addInfo("Metadata", metadata, {height:50});
		var link = resource.url;
		if(!link && resource.fullpath)
			link = LS.ResourcesManager.getFullURL( resource.fullpath );


		widgets.addInfo("Link", "<a target='_blank' href='"+link+"'>link to the file</a>" );
		/*
		widgets.addButton("Show", "Open Window", { callback: function(){
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

		widgets.addSeparator();

		widgets.addButtons(null,["Update Preview","Update metadata"], { callback: function(v) {
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

		widgets.addButton(null,"Load in memory", {callback: function(v){
			var restype = resource.category || resource.object_type;
			DriveModule.loadResource(resource.fullpath,restype);
		}});

		widgets.addButtons(null,["Save","Delete"], {callback: function(v){
			if (v == "Save")
			{
				//var res = ResourcesManager.resources[resource.fullpath];
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

	/*
	showResourceDialog: function(resource)
	{
		if(!resource) return;

		var fullpath = resource.fullpath || resource.filename;
		var server_resource = DriveModule.server_resources[ fullpath ];

		var dialog = new LiteGUI.Dialog("dialog_resource_info", {title:"Resource Info", close: true, width: 520, height: 320, scroll: false, draggable: true});
		dialog.show('fade');

		var split = new LiteGUI.Split("load_scene_split",[50,50]);
		$(dialog.content).append(split.root);

		var preview_url = resource.preview_url;
		if(!preview_url && server_resource)
			preview_url = server_resource.preview_url;
		var preview = new Image();
		if(preview_url)
			preview.src = preview_url;

		var widgets = new LiteGUI.Inspector();
		$(split.sections[0]).append(preview);
		$(split.sections[1]).append(widgets.root);

		if(!resource.metadata)
			resource.metadata = {};

		generate_content();

		//separated so can be called when "update metadata"
		function generate_content()
		{
			widgets.clear();
			var filename = resource.filename;
			if(!filename && server_resource)
				filename = server_resource.filename;

			widgets.addString("Filename", filename, { callback: function(v) { 
				//rename
				DriveModule.renameResource(resource.filename, v);

			}});
			widgets.addInfo("Folder",resource.folder || "");
			widgets.addInfo("Category",resource.category || resource.object_type);

			if(resource.metadata)
				widgets.addTextarea("Description",resource.metadata["description"] , { callback: function(v) { 
					resource.metadata["description"] = v;
				}});

			var metadata = "";
			for(var i in resource.metadata)
			{
				if(i != "description")
					metadata += "<p style='padding:0'><strong>"+i+"</strong>: " + resource.metadata[i] + "</p>\n";
			}

			widgets.addSeparator();

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

				if(bytes > 1024*1024) bytes = (bytes / (1024*1024)).toFixed(1) + " MBs";
				else if(bytes > 1024) bytes = (bytes / 1024).toFixed() + " KBs";
				else bytes += " bytes";

				widgets.addInfo("Bytes", bytes );
			}

			widgets.addInfo("Metadata", metadata, {height:50});
			var link = resource.url;
			if(!link)
				link = LS.ResourcesManager.getFullURL( resource.filename );


			widgets.addInfo("Link", "<a target='_blank' href='"+link+"'>link to the file</a>" );

			widgets.addSeparator();

			widgets.addButtons(null,["Update Snapshot","Update metadata"], { callback: function(v) {
				if(v == "Update Snapshot")
				{
					//update image
					var url = DriveModule.generatePreview(resource, true);
					preview.src = url;
					resource.preview_url = url;
					//upload it in case is a server side file
					DriveModule.onUpdatePreview(function() {
						//preview.src = resource.preview_url;
					});
				}
				else if(v == "Update metadata")
				{
					if(resource.generateMetadata)
					{
						resource.generateMetadata();
						generate_content();
					}
				}
			}});

			widgets.addButton(null,"Load in memory", {callback: function(v){
				var restype = resource.category || resource.object_type;
				DriveModule.loadResource(resource.fullpath,restype);
			}});

			widgets.addButtons(null,["Save","Delete"], {callback: function(v){
				LiteGUI.confirm("Are you sure?", function() {

					if (v == "Save")
					{
						//var res = ResourcesManager.resources[resource.fullpath];
						DriveModule.saveResource(resource);
					}
					else if (v == "Delete")
					{
						DriveModule.serverDeleteFile(resource.id, function(v) { 
							LiteGUI.alert(v?"File deleted":"Error deleting file");
							if(v)
							{
								dialog.close();
								DriveModule.showResourcesInFolder(DriveModule.current_folder);
								//dialog.hide('fade');
							}
						});
					}
				});
			}});
		}
	},
	*/

	renameResource: function(old_name, new_name)
	{
		var res = LS.ResourcesManager.resources[ old_name ];
		if(!res)
			return;
		LS.ResourcesManager.renameResource(old_name, new_name); //rename and inform
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

		
		/*
		function inner(data)
		{
			var folders_tree = {id:"Server",className:"folder",folder:"",fullpath:"/", children:[]};
			build_tree(folders_tree, data, "/");

			var dialog = new LiteGUI.Dialog("select-folder-dialog", {title:"Select folder", close: true, width: 360, height: 240, scroll: false, draggable: true});
			dialog.show('fade');

			var tree_widget = new LiteGUI.Tree("resources-tree", folders_tree, {allow_rename:false} );
			tree_widget.root.style.backgroundColor = "black";
			tree_widget.root.style.padding = "5px";
			tree_widget.root.style.width = "100%";
			tree_widget.root.style.height = "calc( 100% - 22px )";
			tree_widget.root.style.height = "-webkit-calc( 100% - 22px )";
			tree_widget.root.style.overflow = "auto";

			$(tree_widget.root).bind("item_selected", function(e) {
				var data = e.detail;
				selected = data.item.data;
			});

			dialog.addButton("Select", { className: "big", callback: function ()
			{
				if(callback)
					callback( selected ? selected.fullpath : null );
				dialog.close();
			}});
			dialog.content.appendChild( tree_widget.root );
		}

		function build_tree(root, data, fullpath)
		{
			var pos = 0;
			for(var i in data)
			{
				var newroot = {id: i, className:"folder", fullpath: fullpath + i + "/", data: data[i], children:[]};
				root.children[pos] = newroot;
				if(data[i] != null)
					build_tree( newroot, data[i], newroot.fullpath );
				pos++;
			}
		}
		*/
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
		if(!ResourcesManager.resources[fullpath])
		{
			ResourcesManager.load(fullpath, null, function(data) { 
				if(on_complete)
					on_complete(data);
			});
		}
		else
			if(on_complete)
				on_complete(ResourcesManager.resources[fullpath]);

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
	onInsertResourceInScene: function() 
	{
		var resource_item = DriveModule.selected_resource;
		if(!resource_item) { LiteGUI.alert("No resource selected"); return };
		var fullpath = resource_item.dataset["fullpath"] || resource_item.dataset["filename"];
		var restype = resource_item.dataset["restype"];

		var found = false;
		for(var i in DriveModule.insert_resource_callbacks)
		{
			var info = DriveModule.insert_resource_callbacks[i];
			if(info[0] == restype || !info[0] )
			{
				var ret = info[1].call(DriveModule, fullpath, restype, resource_item);
				if(ret == false)
					continue;

				found = true;
				break;
			}
		}

		if(!found)
			LiteGUI.alert("Insert not implemented for this resource type.");

		DriveModule.closeTab();
		LS.GlobalScene.refresh();
	},

	//if className is omited, it will be call with all
	registerAssignResourceCallback: function(className, callback)
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

	onCreateFolderInServer: function()
	{
		LiteGUI.prompt("Folder name", inner);
		function inner(name)
		{
			if(DriveModule.current_folder == null)
				return;

			var folder = DriveModule.current_folder + "/" + name;
			DriveModule.serverCreateFolder(folder, inner_complete);
		}

		function inner_complete(v)
		{
			if(v)
				DriveModule.updateServerTreePanel();
			else
				LiteGUI.alert("Cannot be done (are you logged?)");
		}
	},

	onMoveFolderInServer: function(origin_fullpath, target_fullpath)
	{
		LiteGUI.confirm("Are you sure? All projects using the files inside this folder will have broken references.", inner);
		function inner(v)
		{
			if(!v)
				return;
			LoginModule.session.moveFolder(origin_fullpath, target_fullpath, inner_complete);
		}

		function inner_complete(v)
		{
			if(v)
				DriveModule.updateServerTreePanel();
			else
				LiteGUI.alert("Cannot be done (are you logged?)");
		}
	},

	onDeleteFolderInServer: function()
	{
		LiteGUI.confirm("Are you sure you want to delete the folder? All files will be lost", inner);
		function inner(v)
		{
			if(!v)
				return;

			if(DriveModule.current_folder == null)
				return;

			var folder = DriveModule.current_folder;
			DriveModule.serverDeleteFolder(folder, inner_complete);
		}

		function inner_complete(v)
		{
			if(v)
				DriveModule.updateServerTreePanel();
			else
				LiteGUI.alert("Cannot be done (are you logged?)");
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
				var img = $(DriveModule.selected_resource).find("img")[0];
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

	//returns preview in base64 format
	generatePreview: function( fullpath, force_read_from_memory )
	{
		var resource = LS.ResourcesManager.getResource( fullpath );
		if(!resource)
			return RenderModule.takeScreenshot( this.preview_size, this.preview_size );

		if( resource.updatePreview )
		{
			resource.updatePreview( this.preview_size );
			if( resource.preview_url )
				return resource.preview_url;
		}

		if( resource.toCanvas ) //careful, big textures stall the app for few seconds
		{
			console.log("Generating resource preview using a canvas: ", resource.filename );
			var canvas = resource.toCanvas(null,null,256);
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
		return RenderModule.takeScreenshot(this.preview_size,this.preview_size);
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
	//no path is passed because all the info must be inside
	saveResource: function(resource, on_complete)
	{
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
		var dialog = LiteGUI.alert("<p>Uploading file... <span id='upload_progress'></span></p>");
		this.serverUploadResource( resource, resource.fullpath,
			function(v, msg) { 
				if(v)
					LS.ResourcesManager.resourceSaved( resource );
				$("#upload_progress").remove(); 
				LiteGUI.alert( v ? "Resource saved" : "Problem saving the resource: " + msg);
				if(on_complete)
					on_complete(true);
			},
			function (err, status) { 
				if(status == 413)
					err = "File too big";
				$("#upload_progress").html("Error: " + err); 
				if(on_complete) 
					on_complete(false);
			},
			function (progress) { $("#upload_progress").html( (progress*100)|0 + "%"); }
		);
	},

	viewResource: function(resource)
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
		if(ResourcesManager.resources[ resource.fullpath ])
			ResourcesManager.resources[ resource.fullpath ]._server_info = resource;

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

	serverDeleteFile: function(fullpath, on_complete)
	{
		LoginModule.session.deleteFile(fullpath, on_complete );
	},

	//takes into account if the file is already uploaded
	serverUploadResource: function(resource, fullpath, on_complete, on_error, on_progress )
	{
		var filename = resource.filename;

		if(resource.in_server && LS.ResourcesManager.resources[ fullpath ] )
			resource = LS.ResourcesManager.resources[ fullpath ];

		//in case we update info of a file we dont have in memory
		if(resource.in_server && !LS.ResourcesManager.resources[ fullpath ] )
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
		var internal_data = LS.ResourcesManager.computeResourceInternalData( resource );
		var data = internal_data.data;
		if(internal_data.extension && internal_data.extension != extension)
		{
			filename += "." + internal_data.extension;
			fullpath += "." + internal_data.extension;;
		}

		extension = getExtension( filename ); //recompute it in case it changed
		//if the file doesnt have an extension...
		if(!extension)
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
		if(resource.preview_url && resource.preview_url.substr(0,11) == "data:image/")
			extra_info.preview = resource.preview_url;
		else
			extra_info.preview = this.generatePreview( resource.fullpath );

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
				console.log("Progress",v);
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

	/*
	serverUploadResource: function(resource, on_complete, on_error, on_progress )
	{
		var data = {
			action:"resources:uploadFile",
			data:"",
			encoding:"text",
			filename: resource.filename,
			folder: resource.folder || "",
			metadata:"{}",
			category: resource.object_type || LS.getObjectClassName(resource)
		};

		//remove that annoying slash!
		if(data.folder[0] == "/")
			data.folder = data.folder.substr(1);

		var extension = getExtension( data.filename );

		//get the data
		var internal_data = LS.ResourcesManager.computeResourceInternalData( resource );
		data.data = internal_data.data;
		data.encoding = internal_data.encoding;

		//Arraybuffers are transformed in blobs to be transfered as files...
		if(data.data.constructor == ArrayBuffer)
		{
			data.data = new Blob([data.data], {type: "application/octet-binary"});
			data.encoding = "file";
		}

		if(internal_data.extension && internal_data.extension != extension)
		{
			data.filename = data.filename + "." + internal_data.extension;
		}

		extension = getExtension( data.filename ); //recompute it
		if(!extension)
		{
			if(data.encoding == "file" || data.encoding == "binary")
				data.filename = data.filename + ".wbin"; //add binary extension
			else if(data.encoding == "json")
				data.filename = data.filename + ".json"; //add json
			else
				data.filename = data.filename + ".txt"; //add text
		}

		//generate preview
		data.preview = this.generatePreview(resource);

		//generate form to upload file to server
		var formdata = new FormData();
		for(var i in data)
			formdata.append(i, data[i]);

		var xhr = new XMLHttpRequest();
		if(on_progress)
			xhr.upload.addEventListener("progress", function(evt) { 
					if (!evt.lengthComputable) return;
					var percentComplete = Math.round(evt.loaded * 100 / evt.total);
					on_progress( percentComplete );
	            }, false);
		if(on_error)
		{
			xhr.upload.addEventListener("error", on_error, false);
			xhr.addEventListener("error", on_error, false);
		}
		xhr.addEventListener("load", inner, false);
		xhr.open("POST", DriveModule.server_url + "ajax.php");
		xhr.send(formdata);

		function inner(e)
		{
			if(e.target.status != 200)
			{
				if(on_error)
					on_error(e.target.responseText, e.target.status);
				return;
			}

			try
			{
				var response = JSON.parse( e.target.responseText );
				if(response.status == 1)
				{
					trace("saved");
					resource.id = response.id;
				}
			}
			catch(err)
			{
				trace(e.target.responseText);
				if(on_complete) 
					on_complete(false, "error parsing" );
				return;
			}

			if(on_complete) on_complete(response.status == 1, response.msg);
		}

		function changeExtension(filename, new_extension)
		{
			var filename = filename.substr(0, filename.lastIndexOf("."));
			return filename + "." + new_extension;
		}

		function getExtension(filename)
		{
			var pos = filename.lastIndexOf(".");
			if(pos == -1) return "";
			return filename.substr(pos+1).toLowerCase();
		}
	},
	*/

	/*
	//update an alredy saved resource
	serverUpdateResource: function(resource, on_complete, on_error, on_progress )
	{
		var res_info = resource._server_info;
		if(!res_info) return on_error("File not found in server");

		var server_id = res_info.server_id || res_info.id;

		var data = {
			action:"resources:updateFile",
			file_id: server_id,
			data:"",
			encoding:"text",
			filename: res_info.filename,
			folder: res_info.folder || "",
			category: res_info.category || resource.object_type || LS.getObjectClassName(resource)
		};

		if(res_info.metadata)
			data.metadata = JSON.stringify(res_info.metadata);
		else 
			data.metadata = "{}";

		var extension = getExtension( data.filename );

		//get the data
		var internal_data = LS.ResourcesManager.computeResourceInternalData(resource);
		data.data = internal_data.data;
		data.encoding = internal_data.encoding;

		//Arraybuffers are transformed in blobs to be transfered as files...
		if(data.data.constructor == ArrayBuffer)
		{
			data.data = new Blob([data.data], {type: "application/octet-binary"});
			data.encoding = "file";
		}

		//generate preview
		if(resource.img)
		{
			//probably a texture
			var img = resource.img;
			try //avoid safety problems when no CORS enabled 
			{
				//preview
				var mini_canvas = createCanvas(this.preview_size,this.preview_size);
				ctx = mini_canvas.getContext("2d");
				ctx.drawImage(img,0,0,mini_canvas.width,mini_canvas.height);
				data.preview = mini_canvas.toDataURL("image/png");

				//save them in png
				//data.filename = changeExtension(data.filename,"png");
			}
			catch (err)
			{
				if(on_complete) on_complete(-1, "Image doesnt come from a safe source");
				return;
			}
		}

		if(!data.preview)
			data.preview = RenderModule.takeScreenshot(256,256);

		var formdata = new FormData();
		for(var i in data)
			formdata.append(i, data[i]);

		var xhr = new XMLHttpRequest();
		if(on_progress) //upload progress
			xhr.upload.addEventListener("progress", function(evt) { 
					if (!evt.lengthComputable) return;
					var percentComplete = Math.round(evt.loaded * 100 / evt.total);
					on_progress( percentComplete );
	            }, false);
		if(on_error)
		{
			xhr.upload.addEventListener("error", on_error, false);
			xhr.addEventListener("error", on_error, false);
		}
		xhr.addEventListener("load", inner, false);
		xhr.open("POST", DriveModule.server_url + "ajax.php");
		xhr.send(formdata);

		function inner(e)
		{
			if(e.target.status != 200)
			{
				if(on_error)
					on_error(e.target.responseText, e.target.status);
			}

			try
			{
				var response = JSON.parse( e.target.responseText );
				if(response.status == 1)
				{
					console.log("Saved");
					resource.id = response.id;
				}
			}
			catch(err)
			{
				console.error(e.target.responseText);
				if(on_complete) 
					on_complete(false, "error parsing" );
				return;
			}

			if(on_complete) on_complete(response.status == 1, response.msg);
		}

		function changeExtension(filename, new_extension)
		{
			var filename = filename.substr(0, filename.lastIndexOf("."));
			return filename + "." + new_extension;
		}

		function getExtension(filename)
		{
			var pos = filename.lastIndexOf(".");
			if(pos == -1) return "";
			return filename.substr(pos+1).toLowerCase();
		}
	},
	*/

	serverUpdatePreview: function( fullpath, preview, on_complete, on_error)
	{
		LoginModule.session.updateFilePreview( fullpath, preview, on_complete, on_error);
	},

	serverCreateFolder: function(name, on_complete)
	{
		LoginModule.session.createFolder( name, function(v,resp){
			if(on_complete)
				on_complete(v);
		});
	},


	serverDeleteFolder: function(name, on_complete)
	{
		LoginModule.session.deleteFolder( name, function(v,resp){
			if(on_complete)
				on_complete(v);
		});
	},

	//OVERWRITES THE FUNCTION IN EditorModule
	showSelectResource: function(type, on_complete, on_load )
	{
		var last_tab = LiteGUI.main_tabs.getCurrentTab();
		DriveModule.openTab();
		LiteGUI.Dialog.hideAll();
		var visibility = InterfaceModule.getSidePanelVisibility();
		InterfaceModule.setSidePanelVisibility(false);
		DriveModule.filterResources( type );
		
		DriveModule.on_resource_selected_callback = function( filename ) {
			InterfaceModule.setSidePanelVisibility(visibility);

			if(on_complete)
				on_complete(filename);

			if(filename)
				LS.ResourcesManager.load( filename, null, on_load );

			DriveModule.on_resource_selected_callback = null;
			LiteGUI.Dialog.showAll();
			LiteGUI.main_tabs.selectTab( last_tab.id );
		}
	},

	onResourceSelected: function(filename)
	{
		if(DriveModule.on_resource_selected_callback)
			DriveModule.on_resource_selected_callback( filename );
		DriveModule.on_resource_selected_callback = null;
	},

	onUseProxyResource: function()
	{
		LiteGUI.prompt("URL", inner);
		function inner(url)
		{
			var pos = url.indexOf("//");
			if(pos != -1) //cut http
				url = url.substr(pos+1);
			url = DriveModule.proxy_url + url;
			if(DriveModule.on_resource_selected_callback)
				DriveModule.onResourceSelected( url );
		}
	}


};

CORE.registerModule( DriveModule );


//Resource Insert button
DriveModule.registerAssignResourceCallback("Mesh", function(fullpath, restype, resource_item) {
	DriveModule.loadResource(fullpath, restype);
	var node = LS.newMeshNode( LS.GlobalScene.generateUniqueNodeName(), fullpath);
	EditorModule.getAddRootNode().addChild(node);
	SelectionModule.setSelection(node);
});

DriveModule.registerAssignResourceCallback(["Texture","image/jpg","image/png"], function(fullpath, restype, resource_item) {
	DriveModule.loadResource(fullpath, restype);
	if( LS.GlobalScene.selected_node )
	{
		if(!LS.GlobalScene.selected_node.material)
			LS.GlobalScene.selected_node.material = new Material();
		var material = Scene.selected_node.getMaterial();
		material.setTexture( Material.COLOR_TEXTURE, fullpath );
	}
	EditorModule.inspectNode( LS.GlobalScene.selected_node );
});

//Materials
DriveModule.onInsertMaterial = function(fullpath, restype, resource_item) 
{
	//class not supported?
	if(!LS.MaterialClasses[restype])
		return false;

	DriveModule.loadResource(fullpath, restype, function(material) { 
		LS.ResourcesManager.resources[fullpath] = material; //material in Material format (textures and all loaded)

		EditorModule.inspectNode( LS.GlobalScene.selected_node );
	});

	if( LS.GlobalScene.selected_node )
	{
		LS.GlobalScene.selected_node.material = fullpath;
		EditorModule.inspectNode( LS.GlobalScene.selected_node );
	}
};

DriveModule.registerAssignResourceCallback(null, DriveModule.onInsertMaterial );

/*
DriveModule.registerAssignResourceCallback("SceneNode", function(fullpath, restype, resource_item) {
	//prefab
	DriveModule.loadResource(fullpath, restype, function(data) { 
		var node = new LS.SceneNode();
		node.configure(data);
		ResourcesManager.loadResources( node.getResources({}) );

		Scene.root.addChild(node);
		EditorModule.inspectNode(node);
	});
});
*/

DriveModule.registerAssignResourceCallback("SceneTree", function(fullpath, restype, resource_item) {
	LiteGUI.confirm("Are you sure? you will loose the current scene", function(v) {
		LS.GlobalScene.clear();
		LS.GlobalScene.load( LS.ResourcesManager.path + fullpath, function(scene,url){
			scene.extra.folder = LS.ResourcesManager.getFolder( fullpath );
			scene.extra.fullpath = fullpath;
		});
		DriveModule.closeTab();
	});
});

DriveModule.registerAssignResourceCallback("Prefab", function(fullpath, restype, resource_item) {
	//prefab
	DriveModule.loadResource(fullpath, restype, function(resource) { 
		console.log(resource);
		var node = resource.createObject();
		LS.GlobalScene.root.addChild(node);
		EditorModule.inspectNode(node);
	});
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


