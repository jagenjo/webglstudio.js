/* This module allow to browse the resources (in memory, local or in the repository) 
	TODO: Local repository uses IndexedDB to store the files Blobs
*/

var ResourcesModule = {
	name: "Resources",
	server_url: "",

	tree: { id:"Resources", children:[{id:"Server",className:"folder",folder:"",fullpath:"", children:[]},{id:"Loaded", className:"memory", children:[]}]},

	server_resources: {}, //indexed by filename (includes all resources on the server) 
	server_resources_by_id: {}, //indexed by id in DB

	visible_resources: null, //resources shown on the browser window
	current_folder: null, //current selected server folder
	jpeg_quality: 0.8, //when encoding previews
	texture_thumbnail_size: 256,

	on_resource_selected_callback: null, //callback to catch when a resource is selected
	selected_resource: null, //seletec item in the browser

	root: null,

	insert_resource_callbacks: [],

	init: function()
	{
		this.server_url = LiteGUI.config.server;
		LS.ResourcesManager.setProxy( LiteGUI.config.proxy );
		LS.ResourcesManager.keep_files = true;

		LEvent.bind( LS.ResourcesManager, "resource_registered", function() {
			if(ResourcesModule.current_folder == null ) //loaded
				ResourcesModule.updateBrowserContent(ResourcesManager.resources);
		});

		//initGUI **********************
		if(!gl) 
			return;

		//LiteGUI.menubar.add("Window/Resources", { callback: ResourcesModule.openTab.bind(this) });

		this.tab = LiteGUI.main_tabs.addTab("Resources", {id:"resourcestab", height: "full", content:"", 
			callback: function(tab){
				InterfaceModule.setSidePanelVisibility(true);		
				InterfaceModule.sidepaneltabs.selectTab("Attributes");
			},
			callback_leave: function(tab) {
				if(ResourcesModule.on_resource_selected_callback)
					ResourcesModule.onResourceSelected(null);
			}
		});
		this.root = $(LiteGUI.main_tabs.root).find("#resourcestab")[0];

		LEvent.bind( LS.ResourcesManager, "resource_registered", function(e,res) { 
			ResourcesModule.onResourceRegistered(res); 
		});

		//keep original files to store on server
		ResourcesManager.keep_original = true;

		//use this component to select resources
		EditorModule.showSelectResource = ResourcesModule.showSelectResource;

		this.createWindow();
	},

	createWindow: function()
	{
		var resources_area = this.root;

		var area = new LiteGUI.Area("resarea",{content_id:""});
		resources_area.appendChild(area.root);
		area.split("horizontal",["200px",null],true);

		//TREE
		this.treetop_widget = new LiteGUI.Inspector("resources-treetop-widgets",{name_width: 0, one_line: true });
		this.treetop_widget.addCombo(null,"Folders", { width: 120, values: ["Folders","Categories"], callback: function(){
		}});
		this.treetop_widget.addButton(null,"Refresh", { width: 70, callback: function(){
		}});
		area.sections[0].content.appendChild( this.treetop_widget.root );

		var tree_widget = this.createTreeWidget();
		area.sections[0].content.appendChild( tree_widget.root );

		var server_item = tree_widget.getItem("Server");

		var filter_string = "";
		this.top_widget = new LiteGUI.Inspector("resources-top-widgets", { one_line: true });
		this.top_widget.addString("Filter by","",{ callback: function(v) { 
			filter_string = v;
			ResourcesModule.filterResourcesByName(filter_string);
		}});
		this.updateServerTree();

		this.top_widget.addSeparator();
		this.top_widget.addButton(null,"Insert in scene", { callback: ResourcesModule.onInsertResourceInScene });
		this.top_widget.addButton(null,"Create folder", { callback: ResourcesModule.onCreateFolderInServer });
		this.top_widget.addButton(null,"From URL", { callback: ResourcesModule.onUseProxyResource });

		var res_root = area.sections[1].content;
		$(res_root).append(this.top_widget.root);
		$(res_root).append("<div class='resources-container' style='height: calc(100% - 50px); height: -webkit-calc(100% - 50px); overflow: auto'></div>");

		this.updateBrowserContent();
	},

	openTab: function()
	{
		LiteGUI.main_tabs.selectTab("Resources");
	},

	closeTab: function()
	{
		LiteGUI.main_tabs.selectTab("3D Editor");
	},

	registerTreeRootItem: function( name, callback )
	{
		//TODO
	},

	createTreeWidget: function()
	{
		var tree_widget = new LiteGUI.Tree("resources-tree",this.tree, {allow_rename:true} );
		tree_widget.root.style.backgroundColor = "black";
		tree_widget.root.style.padding = "5px";
		tree_widget.root.style.width = "calc( 100% - 10px )";
		tree_widget.root.style.height = "calc( 100% - 50px )";
		tree_widget.root.style.height = "-webkit-calc( 100% - 50px )";
		this.tree_widget = tree_widget;

		$(tree_widget.root).bind("item_selected", function(e,item) {
			if(item.className == "folder")
			{
				ResourcesModule.current_folder = item.fullpath;
				ResourcesModule.showResourcesInFolder( ResourcesModule.current_folder );
			}
			else if (item.className == "memory")
			{
				ResourcesModule.current_folder = null;
				//ResourcesModule.updateResources();
				ResourcesModule.updateBrowserContent(ResourcesManager.resources);
			}
		});

		$(tree_widget.root).bind("drop_on_item", function(e,item,drop) {
			var folder_element = item.parentNode.data;
			var folder_fullpath = folder_element.fullpath;

			var res_filename = drop.dataTransfer.getData("res-filename");
			var res_id = drop.dataTransfer.getData("res-id");

			if(res_id != "")
			{
				//move to this folder
				ResourcesModule.serverMoveFile(res_id, fullpath, res_filename, function(v) { 
					if(v)
					{
						if(ResourcesModule.current_folder != null) 
							ResourcesModule.showResourcesInFolder(ResourcesModule.current_folder); 
					}
					else
						LiteGUI.alert("Cannot be done (are you logged?)");
				});
			}
			else
			{ //upload to server
				var resource = ResourcesManager.resources[res_filename];
				if(resource)
				{
					ResourcesModule.uploadAndShowProgress(resource, folder_fullpath, function( v, folder, fullpath ) {
						console.log("renaming resource...");
						LS.ResourcesManager.sendResourceRenamedEvent( res_filename, fullpath, resource );
						LS.ResourcesManager.load( fullpath );
					});
				}
			}

		});

		$(tree_widget.root).bind("item_renamed", function(e, old_name, new_name, item)
		{
			trace(item);
		});

		return tree_widget;
	},

	uploadAndShowProgress: function( resource, folder_fullpath, callback )
	{
		if(!folder_fullpath)
			return;

		resource.folder = folder_fullpath;

		var final_fullpath = folder_fullpath;
		if( folder_fullpath.length && folder_fullpath[ folder_fullpath.length - 1 ] != "/") //add slash
			final_fullpath += "/";
		final_fullpath += resource.filename;

		var dialog = LiteGUI.alert("<p>Uploading file... <span id='upload_progress'></span></p>");

		ResourcesModule.serverUploadResource( resource, 
			function(v, msg) { 
				LiteGUI.alert( v ? "Resource saved" : "Problem saving the resource: " + msg);
				if(callback)
					callback(v, folder_fullpath, final_fullpath);
			},
			inner_error,
			function (progress) { $("#upload_progress").html(progress + "%"); }
		);

		function inner_error(err, status)
		{
			if(status == 413)
				LiteGUI.alert("Error: file too big");
			else
				LiteGUI.alert("Error: file cannot be uploaded");
			trace(err);
			if(callback)
				callback(false);
		}
	},

	updateServerTree: function(callback)
	{
		this.serverGetTree(inner);
		function inner(tree)
		{
			if(tree)
			{
				var server_root = tree;
				var tree_root = ResourcesModule.tree.children[0];

				function recursive(fullpath, root)
				{
					var folders = [];
					for(var i in root)
					{
						var folder = { id: i, fullpath: fullpath + "/" + i,className: 'folder', folder:i };
						if(root[i])
							folder.children = recursive(fullpath + "/" + i, root[i] );
						folders.push( folder );
					}
					return folders;
				}

				tree_root.children = recursive("", server_root);
				ResourcesModule.tree_widget.updateTree(ResourcesModule.tree);
			}
			else
				ResourcesModule.tree.children[0].folders = [];
			if(callback) callback(ResourcesModule.tree);
		}
	},

	//clear and rebuild the resources items shown in the browser screen from a list of resources
	updateBrowserContent: function(resources_container)
	{
		//var dialog = this.dialog;
		//if(!dialog) return;

		//var parent = $("#dialog_resources-browser .resources-container")[0];
		var parent = $(this.root).find(".resources-container")[0];

		$(parent).empty();
		var root =  document.createElement("ul");
		root.className = "file-list";
		$(parent).append(root);

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

	//add a new resource to the browser window
	addItemToBrowser: function(resource)
	{
		//if(!this.dialog) return;
		//var parent = $("#dialog_resources-browser .resources-container ul.file-list")[0];
		var parent = $(this.root).find(".resources-container ul.file-list")[0];

		var element =  document.createElement("li");
		if(resource.id)
			element.dataset["id"] = resource.id;
		element.dataset["filename"] = resource.filename;
		if(resource.fullpath)
			element.dataset["fullpath"] = resource.fullpath;
		element.dataset["restype"] = (resource.object_type || getObjectClassName(resource));
		element.className = "resource file-item resource-" + (resource.object_type || getObjectClassName(resource));
		if(resource.id)
			element.className += " in-server";
		else
			element.className += " in-client";

		var filename = resource.filename;
		if(!filename) filename = resource.fullpath;

		var type = resource.object_type || getObjectClassName(resource);
		element.title = type + ": " + resource.filename;
		element.innerHTML = "<strong>"+filename+"</strong>";

		var preview_url = resource.preview_url;
		if(resource._server_info && resource._server_info.preview_url)
			preview_url = resource._server_info.preview_url;

		//generate a thumbnail 
		if(preview_url)
			$(element).append("<img draggable='false' src='" + preview_url + "' />");
		else if(resource.img)
		{
			var canvas = createCanvas(this.texture_thumbnail_size,this.texture_thumbnail_size);
			var ctx = canvas.getContext("2d");
			try
			{
				ctx.drawImage(resource.img,0,0,canvas.width,canvas.height);
			}
			catch (err)
			{
			}
			resource.preview_url = canvas.toDataURL("image/png");
			$(element).append("<img src='" + resource.preview_url + "' />");
		}
		else
			$(element).append("<span class='info'>"+type+"</span>");

		var button = document.createElement("button");
		button.className = "info-button";
		button.innerHTML = "info";
		button.resource = resource;
		$(element).append(button);
		$(button).click( function() { ResourcesModule.showResourceDialog( this.resource ); });

		$(element).click(item_selected);
		$(parent).append(element);

		//when the resources is clicked
		function item_selected()
		{
			ResourcesModule.selected_resource = this;
			if(!ResourcesModule.on_resource_selected_callback)
			{
				//$("#dialog_resources-browser .resources-container").find(".selected").removeClass("selected");
				$(parent).find(".selected").removeClass("selected");
				$(this).addClass("selected");
				ResourcesModule.showResourceInfo( resource );
			}
			else
			{
				var path = this.dataset["fullpath"];
				if(!path)
					path = this.dataset["filename"];
				ResourcesModule.onResourceSelected( path );
			}
		}

		//dragging
		element.draggable = true;
		element.addEventListener("dragstart", function(ev) {
			//trace("DRAGSTART!");
			//this.removeEventListener("dragover", on_drag_over ); //avoid being drag on top of himself
			ev.dataTransfer.setData("res-filename", resource.filename);
			if(resource.id)
				ev.dataTransfer.setData("res-id", resource.id);
		});
	},

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

	showUploadDialog: function(resource)
	{

	},

	showResourceInfo: function(resource)
	{
		if(!resource) 
			return;

		var fullpath = resource.fullpath || resource.filename;
		var server_resource = ResourcesModule.server_resources[ fullpath ];
		var preview_url = resource.preview_url;
		if(!preview_url && server_resource)
			preview_url = server_resource.preview_url;
		var preview = new Image();
		if(preview_url)
			preview.src = preview_url;

		//widgets
		var widgets = InterfaceModule.attributes;
		widgets.clear();

		widgets.addTitle("Resource");
		widgets.addInfo("Name", resource.name );

		widgets.addInfo(null, '<img src="' + preview_url + '" />');

		var filename = resource.filename;
		if(!filename && server_resource)
			filename = server_resource.filename;

		widgets.addString("Filename", filename, { callback: function(v) { 
			//rename
			ResourcesModule.renameResource(resource.filename, v);

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

		widgets.addButtons(null,["Update Snapshot","Update metadata"], { callback: function(v) {
			if(v == "Update Snapshot")
			{
				//update image
				var url = ResourcesModule.generateThumbnail(resource, true);
				preview.src = url;
				resource.preview_url = url;
				//upload it in case is a server side file
				ResourcesModule.onUpdateSnapshot(function() {
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
			ResourcesModule.loadResource(resource.fullpath,restype);
		}});

		widgets.addButtons(null,["Save","Delete"], {callback: function(v){
			LiteGUI.confirm("Are you sure?", function() {

				if (v == "Save")
				{
					//var res = ResourcesManager.resources[resource.fullpath];
					ResourcesModule.saveResource(resource);
				}
				else if (v == "Delete")
				{
					ResourcesModule.serverDeleteFile(resource.id, function(v) { 
						LiteGUI.alert(v?"File deleted":"Error deleting file");
						if(v)
						{
							dialog.close();
							ResourcesModule.showResourcesInFolder(ResourcesModule.current_folder);
							//dialog.hide('fade');
						}
					});
				}
			});
		}});
	},

	showResourceDialog: function(resource)
	{
		if(!resource) return;

		var fullpath = resource.fullpath || resource.filename;
		var server_resource = ResourcesModule.server_resources[ fullpath ];

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
				ResourcesModule.renameResource(resource.filename, v);

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

			widgets.addButtons(null,["Update Snapshot","Update metadata"], { callback: function(v) {
				if(v == "Update Snapshot")
				{
					//update image
					var url = ResourcesModule.generateThumbnail(resource, true);
					preview.src = url;
					resource.preview_url = url;
					//upload it in case is a server side file
					ResourcesModule.onUpdateSnapshot(function() {
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
				ResourcesModule.loadResource(resource.fullpath,restype);
			}});

			widgets.addButtons(null,["Save","Delete"], {callback: function(v){
				LiteGUI.confirm("Are you sure?", function() {

					if (v == "Save")
					{
						//var res = ResourcesManager.resources[resource.fullpath];
						ResourcesModule.saveResource(resource);
					}
					else if (v == "Delete")
					{
						ResourcesModule.serverDeleteFile(resource.id, function(v) { 
							LiteGUI.alert(v?"File deleted":"Error deleting file");
							if(v)
							{
								dialog.close();
								ResourcesModule.showResourcesInFolder(ResourcesModule.current_folder);
								//dialog.hide('fade');
							}
						});
					}
				});
			}});
		}
	},

	renameResource: function(old_name, new_name)
	{
		var res = LS.ResourcesManager.resources[old_name];
		if(!res) return;
		res.filename = new_name;
		LS.ResourcesManager.registerResource(new_name, res);
	},

	showSelectFolderDialog: function(callback, callback_close)
	{
		this.serverGetTree( inner );

		var selected = null;
		
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

			$(tree_widget.root).bind("item_selected", function(e,item) {
				selected = item;
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
	},

	showResourcesInFolder: function(folder, callback)
	{
		this.current_folder = folder;
		//this.updateBrowserContent(null);
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

				this.updateBrowserContent(resources);
			}
			else
				this.updateBrowserContent(null);

			if(callback) callback();
		}
	},

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
		$.getJSON( ResourcesModule.server_url + "ajax.php?action=resources:getFileInfo&fullpath=" + fullpath )
		.done(function (response) {
			//change the Tree Server item
			if(response.status == 1)
			{
				ResourcesModule.processServerResource(response.data);
			}
		})
		.fail(function (err) {
			console.error("Error in getFileInfo: " + err.responseText );
		});
	},

	//called when clicking the "Insert in scene" button after selecting a resource
	onInsertResourceInScene: function() 
	{
		var resource_item = ResourcesModule.selected_resource;
		if(!resource_item) { LiteGUI.alert("No resource selected"); return };
		var fullpath = resource_item.dataset["fullpath"] || resource_item.dataset["filename"];
		var restype = resource_item.dataset["restype"];

		var found = false;
		for(var i in ResourcesModule.insert_resource_callbacks)
		{
			var info = ResourcesModule.insert_resource_callbacks[i];
			if(info[0] == restype || !info[0] )
			{
				var ret = info[1].call(ResourcesModule, fullpath, restype, resource_item);
				if(ret == false)
					continue;

				found = true;
				break;
			}
		}

		if(!found)
			LiteGUI.alert("Insert not implemented for this resource type.");

		ResourcesModule.closeTab();
		Scene.refresh();
	},

	registerAssignResourceCallback: function(className, callback)
	{
		this.insert_resource_callbacks.push([ className, callback ]);
	},

	onCreateFolderInServer: function()
	{
		LiteGUI.prompt("Folder name", inner);
		function inner(name)
		{
			if(ResourcesModule.current_folder == null)
				return;

			var folder = ResourcesModule.current_folder + "/" + name;
			ResourcesModule.serverCreateFolder(folder, inner_complete);
		}

		function inner_complete(v)
		{
			if(v)
				ResourcesModule.updateServerTree();
			else
				LiteGUI.alert("Cannot be done (are you logged?)");
		}
	},

	generatePreviewURL: function(id)
	{
		return this.server_url + "resources/_pics/_" + id + ".png?nocache=" + Math.random();
	},

	onUpdateSnapshot: function(on_complete)
	{
		var resource = ResourcesModule.selected_resource;
		if(!resource) return;

		var filename = resource.dataset["fullpath"];
		if(!filename)
			return;

		var res_id = resource.dataset["id"];
		if(ResourcesModule.visible_resources)
			resource = ResourcesModule.visible_resources[filename];

		var preview = null;
		if(!resource || !resource.id) return;

		//Generate
		preview = ResourcesModule.generateThumbnail(resource);

		//Save
		ResourcesModule.serverUpdatePreview(resource.id, preview, inner);

		function inner(status)
		{
			if(status)
			{
				LiteGUI.alert("Preview updated");
				//force reload the thumbnail without cache
				var img = $(ResourcesModule.selected_resource).find("img")[0];
				if(img)
				{
					resource.preview_url = ResourcesModule.generatePreviewURL( resource.id );
					img.src = resource.preview_url;
				}
			}
			else
				trace("Error updating preview");
			if(on_complete) on_complete();
		}
	},

	generateThumbnail: function(resource, force_read_from_memory )
	{
		//it has an image, then downscale it
		if(resource.img && !force_read_from_memory)
		{
			var img = resource.img;
			try //avoid safety problems when no CORS enabled 
			{
				//preview
				var mini_canvas = createCanvas(this.texture_thumbnail_size,this.texture_thumbnail_size);
				ctx = mini_canvas.getContext("2d");

				if(img.pixels) //non-native image
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
		if(resource.constructor == Texture)
		{
			var w = resource.width;
			var h = resource.height;

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
			ctx.putImageData(pixels,0,0);

			//flip Y
			var final_canvas = createCanvas(this.texture_thumbnail_size,this.texture_thumbnail_size);
			var final_ctx = final_canvas.getContext("2d");
			final_ctx.translate(0,final_canvas.height);
			final_ctx.scale(1,-1);
			final_ctx.drawImage( canvas, 0, 0, final_canvas.width, final_canvas.height );

			return final_canvas.toDataURL("image/png");
		}

		//other form of resource, then do a snapshot of the viewport
		return RenderModule.takeScreenshot(this.texture_thumbnail_size,this.texture_thumbnail_size);
	},

	//called when the resource should be saved (after modifications)
	saveResource: function(resource, on_complete)
	{
		if(!resource){
			trace("ResourcesModule.saveResource: error, resource is null");
			return;
		}

		var func_name = resource._server_info ? "serverUpdateResource" : "serverUploadResource";

		//uploading dialog...
		var dialog = LiteGUI.alert("<p>Uploading file... <span id='upload_progress'></span></p>");
		this[func_name]( resource, 
			function(v, msg) { 
				LiteGUI.alert( v ? "Resource saved" : "Problem saving the resource: " + msg);
				if(on_complete) on_complete(true);
			},
			function (err, status) { 
				if(status == 413)
					err = "File too big";
				$("#upload_progress").html("Error: " + err); 
				if(on_complete) on_complete(false);
			},
			function (progress) { $("#upload_progress").html(progress + "%"); }
		);
	},

	viewResource: function(resource)
	{
		var url = resource.url;
		if(!url)
			url = LS.ResourcesManager.getFullURL( resource.filename );
		window.open(url,'_blank');
	},

	processServerResource: function(data)
	{
		var resource = data;
		
		resource.id = parseInt(resource.id);
		resource.fullpath = resource.folder + "/" + resource.filename;
		resource.url = ResourcesModule.server_url + "resources/" + resource.fullpath;
		resource.object_type = resource.category;
		if(resource.metadata)
			resource.metadata = JSON.parse( resource.metadata );
		else
			resource.metadata = {};
		resource.preview_url = ResourcesModule.server_url + "resources/_pics/_" + resource.id + ".png";

		this.server_resources[ resource.fullpath ] = resource;
		if(ResourcesManager.resources[ resource.fullpath ])
			ResourcesManager.resources[ resource.fullpath ]._server_info = resource;

		return resource;
	},

	//**** SERVER CALLS **************
	serverGetTree: function(on_complete)
	{
		$.getJSON( ResourcesModule.server_url + "ajax.php?action=resources:getFolders" )
		.done(function (response) {
			//change the Tree Server item
			if(on_complete)
				on_complete(response.data);
		})
		.fail(function (err) {
			console.error("Error in serverGetTree: " + err.responseText );
		});
	},

	serverGetFiles: function(folder, on_complete)
	{
		$.getJSON( ResourcesModule.server_url + "ajax.php?action=resources:getFilesByFolder&folder=" + folder )
		.done(function (response) {
			for(var i in response.data)
			{
				ResourcesModule.processServerResource(response.data[i]);
			}
			on_complete(response.data)
		})
		.fail(function (err) {
			console.error("Error in serverGetFiles: " + err.responseText );
		});
	},

	serverMoveFile: function(file_id, new_folder, new_filename, on_complete)
	{
		$.getJSON( ResourcesModule.server_url + "ajax.php",	{
				action:"resources:moveFile",
				file_id: file_id,
				new_folder: new_folder,
				new_filename: new_filename
		})
		.done( function (response) {
			on_complete(response.status == 1)
		})
		.fail(function (err) {
			console.error("Error in serverMoveFile: " + err.responseText );
		});
	},

	serverDeleteFile: function(file_id, on_complete)
	{
		$.getJSON( ResourcesModule.server_url + "ajax.php", {
				action:"resources:deleteFile",
				file_id: file_id
		})
		.done( function (response) {
			on_complete(response.status == 1)
		})
		.fail(function (err) {
			console.error("Error in serverDeleteFile: " + err.responseText );
		});
	},

	serverDeleteFileByFilename: function(fullpath, on_complete)
	{
		$.getJSON( ResourcesModule.server_url + "ajax.php", {
				action:"resources:deleteFileByFilename",
				fullpath: fullpath
		})
		.done( function (response) {
			on_complete(response.status == 1)
		})
		.fail(function (err) {
			console.error("Error in deleteFileByFilename: " + err.responseText );
		});
	},	

	serverUploadResource: function(resource, on_complete, on_error, on_progress )
	{
		var data = {
			action:"resources:uploadFile",
			data:"",
			encoding:"text",
			filename: resource.filename,
			folder: resource.folder || "",
			metadata:"{}",
			category: resource.object_type || getObjectClassName(resource)
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
		data.preview = this.generateThumbnail(resource);

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
		xhr.open("POST", ResourcesModule.server_url + "ajax.php");
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
			category: res_info.category || resource.object_type || getObjectClassName(resource)
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
				var mini_canvas = createCanvas(this.texture_thumbnail_size,this.texture_thumbnail_size);
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
		xhr.open("POST", ResourcesModule.server_url + "ajax.php");
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

	serverUpdatePreview: function(file_id, preview, on_complete)
	{
		$.ajax({
			url: ResourcesModule.server_url + "ajax.php",
			type: "POST",
			data: {
				action:"resources:updateFilePreview",
				file_id: file_id,
				preview: preview
			},
			dataType: 'json',
			success: inner
		});

		function inner(response)
		{
			on_complete(response.status == 1)
		}
	},

	serverCreateFolder: function(name, on_complete)
	{
		$.ajax({
			url: ResourcesModule.server_url + "ajax.php?action=resources:createFolder&folder=" + name,
			dataType: 'json',
			success: function(result)
			{
				if(on_complete)
					on_complete(result.status == 1);
			}
		});
	},

	//OVERWRITES THE FUNCTION IN EditorModule
	showSelectResource: function(type, on_complete)
	{
		var last_tab = LiteGUI.main_tabs.getCurrentTab();
		ResourcesModule.openTab();
		$(".litepanel").hide(); //hide dialogs
		ResourcesModule.filterResources(type);
		
		ResourcesModule.on_resource_selected_callback = function(filename) {
			if(on_complete)
				on_complete(filename);

			ResourcesModule.on_resource_selected_callback = null;
			$(".litepanel").show(); //show dialogs
			LiteGUI.main_tabs.selectTab( last_tab[0] );
		}
	},

	onResourceSelected: function(filename)
	{
		if(ResourcesModule.on_resource_selected_callback)
			ResourcesModule.on_resource_selected_callback(filename);
		ResourcesModule.on_resource_selected_callback = null;
	},

	onUseProxyResource: function()
	{
		LiteGUI.prompt("URL", inner);
		function inner(url)
		{
			var pos = url.indexOf("//");
			if(pos != -1) //cut http
				url = url.substr(pos+1);
			url = ResourcesModule.proxy_url + url;
			if(ResourcesModule.on_resource_selected_callback)
				ResourcesModule.onResourceSelected(url);
		}
	}


};

LiteGUI.registerModule( ResourcesModule );


//Resource Insert button
ResourcesModule.registerAssignResourceCallback("Mesh", function(fullpath, restype, resource_item) {
	ResourcesModule.loadResource(fullpath, restype);
	var node = LS.newMeshNode( Scene.generateUniqueNodeName(), fullpath);
	EditorModule.getAddRootNode().addChild(node);
	SelectionModule.setSelection(node);
});

ResourcesModule.registerAssignResourceCallback("Texture", function(fullpath, restype, resource_item) {
	ResourcesModule.loadResource(fullpath, restype);
	if( Scene.selected_node )
	{
		if(!Scene.selected_node.material)
			Scene.selected_node.material = new Material();
		var material = Scene.selected_node.getMaterial();
		material.setTexture( fullpath );
	}
	EditorModule.showNodeAttributes(Scene.selected_node);
});

//Materials
ResourcesModule.onInsertMaterial = function(fullpath, restype, resource_item) 
{
	//class not supported?
	if(!LS.MaterialClasses[restype])
		return false;

	ResourcesModule.loadResource(fullpath, restype, function(material) { 
		LS.ResourcesManager.resources[fullpath] = material; //material in Material format (textures and all loaded)

		EditorModule.showNodeAttributes(Scene.selected_node);
	});

	if( Scene.selected_node )
	{
		Scene.selected_node.material = fullpath;
		EditorModule.showNodeAttributes( Scene.selected_node );
	}
};

ResourcesModule.registerAssignResourceCallback(null, ResourcesModule.onInsertMaterial );

/*
ResourcesModule.registerAssignResourceCallback("SceneNode", function(fullpath, restype, resource_item) {
	//prefab
	ResourcesModule.loadResource(fullpath, restype, function(data) { 
		var node = new LS.SceneNode();
		node.configure(data);
		ResourcesManager.loadResources( node.getResources({}) );

		Scene.root.addChild(node);
		EditorModule.showNodeAttributes(node);
	});
});
*/

ResourcesModule.registerAssignResourceCallback("SceneTree", function(fullpath, restype, resource_item) {
	LiteGUI.confirm("Are you sure? you will loose the current scene", function(v) {
		Scene.load(ResourcesManager.path + fullpath);
		ResourcesModule.closeTab();
	});
});

ResourcesModule.registerAssignResourceCallback("Prefab", function(fullpath, restype, resource_item) {
	//prefab
	ResourcesModule.loadResource(fullpath, restype, function(resource) { 
		console.log(resource);
		var node = resource.createObject();
		Scene.root.addChild(node);
		EditorModule.showNodeAttributes(node);
	});
});




