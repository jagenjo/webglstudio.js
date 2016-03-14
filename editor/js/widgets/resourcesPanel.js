//Represents the tree view of the Scene Tree, and controls basic events like dragging or double clicking
function ResourcesPanelWidget( id )
{
	var that = this;

	this.selected_item = null;

	this.current_folder = null;
	this.current_bridge = null;

	this.filter_by_name = null;
	this.filter_by_category = null;

	this.root = document.createElement("div");
	this.root.className = "resources-panel";
	this.root.style.width = "100%";
	this.root.style.height = "100%";
	if(id)
		this.root.id = id;

	this.area = new LiteGUI.Area(null);
	this.area.split("horizontal",[320,null],{draggable: true});
	this.area.getSection(0).content.style.overflow = "auto";
	this.area.getSection(0).content.style.backgroundColor = "black";
	this.root.appendChild( this.area.root );

	//tree
	this.createTreeWidget();

	//files
	var files_section = this.area.getSection(1);
	this.area.root.addEventListener("contextmenu", (function(e) { this.showFolderContextualMenu(e); e.preventDefault(); }).bind(that) );

	var browser_root = new LiteGUI.Area(null,{ full: true });
	files_section.add( browser_root );
	browser_root.split("vertical",[30,null]);

	var top_inspector = new LiteGUI.Inspector(null,{ one_line: true });
	top_inspector.addString("Filter","",{ callback: function(v) { 
		that.filterByName(v);
	}});
	top_inspector.root.style.marginTop = "4px";
	top_inspector.addSeparator();
	top_inspector.addButton(null,"New", function(){ DriveModule.showNewResourceDialog(); });
	top_inspector.addButton(null,"Insert in scene", function(){ DriveModule.onInsertResourceInScene( that.selected_item ); });
	top_inspector.addButton(null,"Import File", function(){ 
		ImporterModule.showImportResourceDialog(null,{ folder: that.current_folder }, function(){ that.refreshContent(); });
	});

	browser_root.sections[0].add( top_inspector );

	this.browser_container = browser_root.sections[1].content;
	this.browser_container.classList.add("resources-panel-container");
	this.showInBrowserContent(null); //make it ready

	var login_callback = this.onLoginEvent.bind(this);
	var tree_update_callback = this.onTreeUpdate.bind(this);

	this.root.addEventListener("DOMNodeInsertedIntoDocument", function(){ 
		LiteGUI.bind( CORE, "user-login", login_callback );
		LiteGUI.bind( CORE, "user-logout", login_callback );
		LiteGUI.bind( DriveModule, "tree_updated", tree_update_callback );
		LEvent.bind( LS.ResourcesManager, "resource_registered", that.onResourceRegistered, that );
	});
	this.root.addEventListener("DOMNodeRemovedFromDocument", function(){ 
		LiteGUI.unbind( CORE, "user-login", login_callback );
		LiteGUI.unbind( CORE, "user-logout", login_callback );
		LiteGUI.unbind( DriveModule, "tree_updated", tree_update_callback );
		LEvent.unbind( LS.ResourcesManager, "resource_registered", that.onResourceRegistered, that );
	});

	//drop in browser container
	LiteGUI.createDropArea( this.browser_container, function(e) {
		var fullpath = that.current_folder;
		var bridge = that.current_bridge;
		if(!bridge)
			return false;
		if(bridge.onDropInFolder)
		{
			var r = bridge.onDropInFolder(fullpath, e);
			if(r)
				e.stopPropagation();
			return r;
		}
	});

	//EVENTS
	this.bindEvents();
}

ResourcesPanelWidget.widget_name = "Resources";

CORE.registerWidget( ResourcesPanelWidget );

ResourcesPanelWidget.createDialog = function( parent )
{
	var dialog = new LiteGUI.Dialog( null, { title: ResourcesPanelWidget.widget_name, fullcontent: true, closable: true, draggable: true, detachable: true, minimize: true, resizable: true, parent: parent, width: 900, height: 500 });
	var widget = new ResourcesPanelWidget();
	dialog.add( widget );
	dialog.widget = widget;
	dialog.on_close = function()
	{
		widget.unbindEvents();		
	}
	dialog.show();
	return dialog;
}

ResourcesPanelWidget.prototype.selectFolder = function( name )
{
	//search in the tree and click it
	var folder = this.tree_widget.getItem( name );
	if(folder)
		LiteGUI.trigger( folder, "click" );
}

ResourcesPanelWidget.prototype.getTreeData = function()
{
	return DriveModule.tree;
}

ResourcesPanelWidget.prototype.update = function( callback )
{
	//TODO
}

ResourcesPanelWidget.prototype.createTreeWidget = function()
{
	var tree_widget = new LiteGUI.Tree( null, this.getTreeData(), { allow_rename: true, indent_offset: -1 } );
	tree_widget.root.classList.add("resources-tree");
	tree_widget.root.style.backgroundColor = "black";
	tree_widget.root.style.padding = "5px";
	tree_widget.root.style.width = "100%";
	tree_widget.root.style.height = "100%";
	this.tree_widget = tree_widget;
	var that = this;

	this.area.add( tree_widget );

	this.tree_widget.onItemContextMenu = function(e, item)
	{
		var fullpath = item.data.fullpath;
		if(!fullpath)
			return;

		var menu = new LiteGUI.ContextualMenu(["Create Folder","Delete Folder","Rename"], { event: e, callback: function(v) {
			if(v == "Create Folder")
				DriveModule.onCreateFolderInServer( fullpath, function(){ that.refreshTree(); });
			else if(v == "Delete Folder")
				DriveModule.onDeleteFolderInServer( fullpath, function(){ that.refreshTree(); });
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
			{
				that.current_folder = item.fullpath;
				that.current_bridge = item.bridge;
				item.bridge.onFolderSelected( item, that );
			}
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
}


ResourcesPanelWidget.prototype.showInBrowserContent = function( items, options )
{
	options = options || {};

	var parent = this.browser_container;

	if(options.preserve)
	{
		var block = document.createElement("div");
		block.className = "file-list-block";
		parent.appendChild( block );
		if(options.info)
		{
			var info = document.createElement("div");
			info.className = "info";
			info.innerHTML = options.info;
			block.appendChild(info);
		}
		return;
	}
	else
		parent.innerHTML = "";

	var title = document.createElement("div");
	title.className = "file-list-title";
	if(options.title)
		title.innerHTML = options.title;
	else if(options.folder)
	{
		title.innerHTML = "<span class='foldername'>" + options.folder.split("/").join("<span class='foldername-slash'>/</span>") + "</span>";
	}
	parent.appendChild( title );

	var root =  document.createElement("ul");
	root.className = "file-list";
	root.style.height = "calc( 100% - 24px )";
	parent.appendChild( root );

	this.visible_resources = items;
	this._last_options = options;

	if(items)
		for(var i in items)
		{
			if(i[0] == ":") //local resource
				continue;
			var item = items[i];
			if(!item.name)
				item.name = i;
			this.addItemToBrowser( item );
		}
	else
	{
		if(options.content)
			root.innerHTML = options.content;
		else if(options.info)
			root.innerHTML = "<div class='file-list-info'>"+options.info+"</div>";
		else
			root.innerHTML = "<div class='file-list-info'>No items</div>";
	}
}

//add a new resource to the browser window
ResourcesPanelWidget.prototype.addItemToBrowser = function( resource )
{
	var that = this;
	var memory_resource = LS.ResourcesManager.resources[ resource.fullpath ];
	if(memory_resource && memory_resource.is_preview)
		return;

	//if(!this.dialog) return;
	//var parent = $("#dialog_resources-browser .resources-container ul.file-list")[0];
	var parent = this.browser_container.querySelector(".file-list");

	var element =  document.createElement("li");
	if(resource.id)
		element.dataset["id"] = resource.id;
	element.dataset["filename"] = resource.filename;
	if(resource.fullpath)
		element.dataset["fullpath"] = resource.fullpath;
	var type = resource.object_type || resource.category || LS.getObjectClassName( resource );
	if(type == "Object") //in server_side resources that dont have category
		type = LS.Formats.guessType( resource.fullpath || resource.filename );
	if(!type)
		type = "unknown";
	element.dataset["restype"] = type;

	if(resource.category)
		element.dataset["category"] = resource.category;

	element.className = "resource file-item resource-" + type;
	if(resource.id)
		element.className += " in-server";
	else
		element.className += " in-client";

	element.resource = resource;

	if(resource._modified  || (memory_resource && memory_resource._modified) )
		element.className += " modified";

	var filename = DriveModule.getFilename( resource.filename );
	if(!filename) 
		filename = resource.fullpath;

	element.title = type + ": " + resource.filename;
	if(filename)
	{
		var clean_name = filename.split(".");
		clean_name = clean_name.shift() + "<span class='extension'>." + clean_name.join(".") + "</span>";
		element.innerHTML = "<span class='title'>"+clean_name+"</span>";
	}

	var type_title = LS.RM.getExtension( filename );
	if(!type_title || type_title.toUpperCase() == "JSON")
		type_title = type;
	else
		type_title = type_title.toUpperCase();
	

	//REFACTOR THIS FOR GOD SAKE!!!!!!!!!!!!!!!!!!!!!!!
	var preview = resource.preview_url;
	var res_name = resource.fullpath || resource.filename;
	
	if(preview)
	{
		//we cache imgs from previews to speed up when changing folders
		if(typeof(preview) == "string" && preview.substr(0,11) == "data:image/")
		{
			var res_name = resource.fullpath || resource.filename;
			if(DriveModule.generated_previews[ res_name ])
				preview = DriveModule.generated_previews[ res_name ];
			else
			{
				var img = new Image();
				img.src = preview;
				img.style.maxWidth = 200;
				DriveModule.generated_previews[ res_name ] = img;
				preview = img;
			}
		}
	}
	else //if no preview we generate it
	{
		if(resource.in_server)
			preview = DriveModule.getServerPreviewURL( resource );
		else 
		{
			if( DriveModule.generated_previews[ res_name ] )
			{
				preview = DriveModule.generated_previews[ res_name ];
			}
			else if( !resource.fullpath ) //is a local resource
			{
				preview = DriveModule.generatePreview( res_name, undefined, true );
				if(preview)
				{
					var img = new Image();
					img.src = preview;
					img.style.maxWidth = 200;
					DriveModule.generated_previews[ res_name ] = img;
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
	
	var info = document.createElement("span");
	info.className = "info";
	info.innerHTML = type_title;
	element.appendChild(info);

	element.addEventListener("click", item_selected);
	element.addEventListener("dblclick", item_dblclick);
	parent.appendChild(element);

	//when the resources is clicked
	function item_selected(e)
	{
		if(!that.on_resource_selected_callback)
		{
			var items = parent.querySelectorAll(".selected");
			for(var i = 0; i < items.length; ++i)
				items[i].classList.remove("selected");
			element.classList.add("selected");
			LiteGUI.trigger( that, "item_selected", element );
			that.selected_item = element;
		}
		else
		{
			var path = element.dataset["fullpath"] || element.dataset["filename"];
			var callback = that.on_resource_selected_callback;
			that.on_resource_selected_callback = null;
			if( callback( path, e ) ) //for multiple files selection, keep the callback
				that.on_resource_selected_callback = callback;

		}
	}

	function item_dblclick(e)
	{
		DriveModule.onInsertResourceInScene( this );
	}

	//dragging
	element.draggable = true;
	element.addEventListener("dragstart", function(ev) {
		//trace("DRAGSTART!");
		//this.removeEventListener("dragover", on_drag_over ); //avoid being drag on top of himself
		ev.dataTransfer.setData("res-filename", resource.filename );
		if(resource.fullpath)
			ev.dataTransfer.setData("res-fullpath", resource.fullpath );
		ev.dataTransfer.setData("res-type", type);
	});

	element.addEventListener("contextmenu", function(e) { 
		if(e.button != 2) //right button
			return false;
		that.showItemContextualMenu(this,e);
		e.stopImmediatePropagation();
		e.stopPropagation();
		e.preventDefault(); 
		return false;
	});
}

ResourcesPanelWidget.prototype.showItemContextualMenu = function( item, event )
{
	var that = this;
	var actions = ["Insert","Load","Clone","Move","Properties",null,"Delete"];

	var menu = new LiteGUI.ContextualMenu( actions, { ignore_item_callbacks: true, event: event, title: "Resource", callback: function(action, options, event) {
		var fullpath = item.dataset["fullpath"] || item.dataset["filename"];
		if(!fullpath)
			return;

		if(action == "Insert")
		{
			DriveModule.onInsertResourceInScene( item );
		}
		else if(action == "Load")
		{
			LS.ResourcesManager.load( fullpath );
		}
		else if(action == "Clone")
		{
			LiteGUI.alert("Not implemented yet");
		}
		else if(action == "Move")
		{
			LiteGUI.alert("Not implemented yet");
		}
		else if(action == "Properties")
		{
			DriveModule.showResourceInfoInDialog( item.resource );
		}
		else if(action == "Delete")
		{
			LiteGUI.confirm("Do you want to delete this file?", function(v){
				if(!v)
					return;
				LS.RM.unregisterResource( fullpath );
				DriveModule.serverDeleteFile( fullpath, function(v) { 
					if(v)
						that.refreshContent();
				});
			});
		}
		else
			LiteGUI.alert("Unknown action");
	}});
}

ResourcesPanelWidget.prototype.showFolderContextualMenu = function(e)
{
	var that = this;

	var options = [
		{ title: "Create", submenu: {
				options: ["Script","Text","Pack"],
				callback: inner_create
			}
		},
		{ title: "Refresh", function(){ that.refreshContent(); } }
	];

	var menu = new LiteGUI.ContextualMenu( options, { event: e, title: "Folder" });
	
	function inner_create( action, options, event )
	{
		if(action == "Script")
			that.onShowCreateFileDialog({filename: "script.js" });
		else if(action == "Text")
			that.onShowCreateFileDialog({filename: "text.txt" });
		else if(action == "Pack")
			PackTools.showCreatePackDialog({folder: that.current_folder});
	}
}

ResourcesPanelWidget.prototype.refreshTree = function()
{
	this.tree_widget.updateTree( DriveModule.tree );
}

ResourcesPanelWidget.prototype.refreshContent = function()
{
	if( this.current_bridge )
		this.current_bridge.updateContent( this.current_folder );
	else {
		//memory
		this.showInBrowserContent( LS.ResourcesManager.resources );
		//this.showInBrowserContent( this.visible_resources, this._last_options );
	}
}


ResourcesPanelWidget.prototype.destroy = function()
{
	LEvent.unbindAll( LS.GlobalScene, this );
	if(this.root.parentNode)
		this.root.parentNode.removeChild( this.root );
}

//Catch events from the LS.SceneTree to update the tree automatically
ResourcesPanelWidget.prototype.bindEvents = function()
{
	var that = this;
}

ResourcesPanelWidget.prototype.unbindEvents = function()
{
	var that = this;
}

ResourcesPanelWidget.prototype.onResourceRegistered = function(e,res)
{
	if(!this.current_folder)
		this.refreshContent();
}

ResourcesPanelWidget.prototype.clear = function()
{
	if(!this.tree)
		return;
	this.tree.clear(true);
}

ResourcesPanelWidget.prototype.showContextualMenu = function(e){
	var menu = new LiteGUI.ContextualMenu( ["Refresh"], { event: event, callback: function(value) {
		if(value == "Refresh")
			this.refresh();
	}});
}

ResourcesPanelWidget.prototype.filterByName = function( text )
{
	this.filter_by_name = text;

	text = text.toLowerCase();
	var parent = this.root.querySelector("ul.file-list");
	var items = parent.querySelectorAll(".file-item");
	for(var i = 0; i < items.length; ++i )
	{
		var item = items[i];
		var filename = item.dataset["filename"];
		if(!filename)
			continue;
		filename = filename.toLowerCase();
		if( !text || filename.indexOf(text) != -1 )
			item.style.display = "";
		else
			item.style.display = "none";
	}
}

ResourcesPanelWidget.prototype.filterByCategory = function( category )
{
	this.filter_by_category = category;

	category = category.toLowerCase();
	var parent = this.root.querySelector("ul.file-list");
	var items = parent.querySelectorAll(".file-item");
	for(var i = 0; i < items.length; ++i )
	{
		var item = items[i];
		var item_category = item.dataset["category"];
		if(!item_category)
			continue;
		item_category = item_category.toLowerCase();
		if( item_category == category )
			item.style.display = "";
		else
			item.style.display = "none";
	}
}


ResourcesPanelWidget.prototype.refresh = function( update_from_server )
{
	var that = this;
	if(update_from_server)
	{
		DriveModule.getServerFoldersTree( function(){
			that.tree_widget.updateTree( DriveModule.tree );
		});
	}
	else
		this.tree_widget.updateTree( DriveModule.tree );
}

ResourcesPanelWidget.prototype.onLoginEvent = function(e)
{
	//nothing to do, everything done in onTreeUpdate
}

ResourcesPanelWidget.prototype.onTreeUpdate = function(e)
{
	this.refreshTree();
	this.refreshContent();
}

ResourcesPanelWidget.prototype.onShowCreateFileDialog = function( options )
{
	var that = this;
	options = options || {};
	var filename = options.filename || "unnamed.txt";
	var folder = options.folder || this.current_folder;

	var dialog = new LiteGUI.Dialog( null, { title: "New File", fullcontent: true, closable: true, draggable: true, resizable: true, width: 300, height: 300 });
	var inspector = new LiteGUI.Inspector();

	inspector.addString("Filename",filename, function(v){ filename = v; });
	inspector.addString("Folder",folder, function(v){ folder = v; });
	inspector.addButton(null,"Create", inner);

	function inner()
	{
		folder = folder || "";
		//create dummy file
		var resource = new LS.Resource();
		resource.filename = filename;
		if(folder && folder != "")
			resource.fullpath = folder + "/" + filename;
		resource.data = "";

		//upload to server? depends if it is local or not
		resource.register();
		if(resource.fullpath)
		{
			DriveModule.saveResource( resource, function(v){
				that.refreshContent();
			}, { skip_alerts: true });
		}

		//refresh
		//close
		dialog.close();
	}

	dialog.add( inspector );
	dialog.show( null, this._root );
	dialog.adjustSize();
	return dialog;
}



