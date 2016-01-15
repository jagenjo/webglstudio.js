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
	this.area.root.addEventListener("contextmenu", function(e) { e.preventDefault(); });

	var browser_root = new LiteGUI.Area(null,{ full: true });
	files_section.add( browser_root );
	browser_root.split("vertical",[30,null]);

	var top_inspector = new LiteGUI.Inspector(null,{ one_line: true });
	top_inspector.addString("Filter","",{ callback: function(v) { 
		that.filterByName(v);
	}});
	top_inspector.addSeparator();
	top_inspector.addButton(null,"New", function(){ DriveModule.showNewResourceDialog(); });
	top_inspector.addButton(null,"Insert in scene", function(){ DriveModule.onInsertResourceInScene( that.selected_item ); });
	top_inspector.addButton(null,"Import File", function(){ ImporterModule.showImportResourceDialog(); });

	browser_root.sections[0].add( top_inspector );

	this.browser_container = browser_root.sections[1].content;
	this.showInBrowserContent(null); //make it ready

	var login_callback = this.onLoginEvent.bind(this);
	var tree_update_callback = this.onTreeUpdate.bind(this);

	this.root.addEventListener("DOMNodeInsertedIntoDocument", function(){ 
		LiteGUI.bind( CORE, "user-login", login_callback );
		LiteGUI.bind( CORE, "user-logout", login_callback );
		LiteGUI.bind( DriveModule, "tree_updated", tree_update_callback );

	});
	this.root.addEventListener("DOMNodeRemovedFromDocument", function(){ 
		LiteGUI.unbind( CORE, "user-login", login_callback );
		LiteGUI.unbind( CORE, "user-logout", login_callback );
		LiteGUI.unbind( DriveModule, "tree_updated", tree_update_callback );
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
	var type = element.dataset["restype"] = (resource.object_type || resource.category || LS.getObjectClassName(resource));
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

	//REFACTOR THIS FOR GOD SAKE!!!!!!!!!!!!!!!!!!!!!!!
	var preview = resource.preview_url;
	
	if(preview)
	{
		if(typeof(preview) == "string" && preview.substr(0,11) == "data:image/")
		{
			if(DriveModule.generated_previews[ resource.fullpath ])
				preview = DriveModule.generated_previews[ resource.fullpath ];
			else
			{
				var img = new Image();
				img.src = preview;
				img.style.maxWidth = 200;
				DriveModule.generated_previews[ resource.fullpath ] = img;
				preview = img;
			}
		}
	}
	else
	{
		var filename = resource.fullpath || resource.filename;

		if(resource.in_server)
			preview = DriveModule.getServerPreviewURL( resource );
		else 
		{
			if( DriveModule.generated_previews[ filename ] )
			{
				preview = DriveModule.generated_previews[ filename ];
			}
			else if( !resource.fullpath ) //is hosted somewhere
			{
				preview = DriveModule.generatePreview( filename );
				if(preview)
				{
					var img = new Image();
					img.src = preview;
					img.style.maxWidth = 200;
					DriveModule.generated_previews[ filename ] = img;
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
			var path = element.dataset["fullpath"];
			var callback = that.on_resource_selected_callback;
			that.on_resource_selected_callback = null;
			callback( path );
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
		ev.dataTransfer.setData("res-filename", resource.filename);
		if(resource.fullpath)
			ev.dataTransfer.setData("res-fullpath", resource.fullpath);
		ev.dataTransfer.setData("res-type", type);
	});

	element.addEventListener("contextmenu", function(e) { 
		if(e.button != 2) //right button
			return false;
		that.showItemContextualMenu(this,e);
		e.preventDefault(); 
		return false;
	});
}

ResourcesPanelWidget.prototype.showItemContextualMenu = function( item, event )
{
	var actions = ["Insert","Clone","Move","Properties",null,"Delete"];

	var menu = new LiteGUI.ContextualMenu( actions, { ignore_item_callbacks: true, event: event, title: "Resource", callback: function(action, options, event) {
		var fullpath = item.dataset["fullpath"] || item.dataset["filename"];
		if(!fullpath)
			return;

		if(action == "Insert")
		{
			DriveModule.onInsertResourceInScene( item );
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
			DriveModule.serverDeleteFile( fullpath, function(v) { 
				if(v)
					DriveModule.refreshContent();
			});
		}
		else
			LiteGUI.alert("Unknown action");
	}});
}

ResourcesPanelWidget.prototype.onTreeUpdated = function()
{
	this.refreshTree();
	this.refreshContent();
}

ResourcesPanelWidget.prototype.refreshTree = function()
{
	this.tree_widget.updateTree( DriveModule.tree );
}

ResourcesPanelWidget.prototype.refreshContent = function()
{
	if( this.current_bridge )
		this.current_bridge.updateContent( this.current_folder );
	else
		this.showInBrowserContent( this.visible_resources );
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

ResourcesPanelWidget.prototype.showInBrowserContent = function( items )
{
	var parent = this.browser_container;
	parent.innerHTML = "";
	var root =  document.createElement("ul");
	root.className = "file-list";
	parent.appendChild( root );

	this.visible_resources = items;

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
			item.style.display = null;
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
			item.style.display = null;
		else
			item.style.display = "none";
	}
}


ResourcesPanelWidget.prototype.refresh = function()
{
	this.tree_widget.updateTree( DriveModule.tree );
}

ResourcesPanelWidget.prototype.onLoginEvent = function(e)
{
}

ResourcesPanelWidget.prototype.onTreeUpdate = function(e)
{
	this.refresh();
}




