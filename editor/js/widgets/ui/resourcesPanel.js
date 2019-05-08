//Represents the tree view of the Scene Tree, and controls basic events like dragging or double clicking
function ResourcesPanelWidget( options )
{
	options = options || {};

	var that = this;

	this.selected_item = null;

	this.current_folder = null;
	this.current_bridge = null;

	this.filter_by_name = null;
	this.filter_by_category = null;

	this.root = document.createElement("div");
	this.root.className = "resources-panel";
	this.root.panel = this; //link
	this.root.style.width = "100%";
	this.root.style.height = "100%";
	if(options.id)
		this.root.id = options.id;

	this.area = new LiteGUI.Area(null);
	this.area.split("horizontal",[320,null],{draggable: true});
	this.area.getSection(0).content.style.overflow = "auto";
	this.area.getSection(0).content.style.backgroundColor = "black";
    this.area.root.style.borderTop = "1px solid #222";
	this.root.appendChild( this.area.root );

	//tree
	this.createTreeWidget();

	//files
	var files_section = this.area.getSection(1);
	this.area.root.addEventListener("contextmenu", (function(e) { this.showFolderContextMenu(e); e.preventDefault(); }).bind(that) );

	var browser_root = new LiteGUI.Area( { full: true });
	files_section.add( browser_root );
	browser_root.split("vertical",[30,null]);

	//create top bar
	var top_inspector = new LiteGUI.Inspector( { one_line: true } );
	top_inspector.root.style.marginTop = "3px";

	//filter by name
	top_inspector.addString("Filter","",{ name_width: 40, content_width: 120, width: 160, callback: function(v) { 
		that.filterByName(v);
	}});

	//filter by category
	var valid_categories = [""];
	for(var i in LS.ResourceClasses)
		valid_categories.push( LS.ResourceClasses[i] );
	//should be a combo but chrome keeps crashing when I use a combo, so it will be a string
	this.filter_by_category_widget = top_inspector.addString("Category","",{ name_width: 60, content_width: 140, width: 200, values: valid_categories, callback: function(v) { 
		that.filterByCategory( v, true );
	}});

	if(!options.skip_actions)
	{
		top_inspector.addSeparator();
		top_inspector.addButton(null,"New", { width: 50, function(v,e){ DriveModule.showCreateNewFileMenu( that.current_folder, e ); }});
		//top_inspector.addButton(null,"Insert in scene", function(){ DriveModule.onInsertResourceInScene( that.selected_item ); });
		top_inspector.addButton(null,"Import File", function(){ 
			ImporterModule.showImportResourceDialog(null,{ folder: that.current_folder }, function(){ that.refreshContent(); });
		});
	}

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
	var dialog = new LiteGUI.Dialog( { title: ResourcesPanelWidget.widget_name, fullcontent: true, closable: true, draggable: true, detachable: true, minimize: true, resizable: true, parent: parent, width: 900, height: 500 });
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
	var tree_widget = new LiteGUI.Tree( this.getTreeData(), { allow_rename: true, collapsed_depth: 3, indent_offset: -1 } );
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

		var menu = new LiteGUI.ContextMenu(["Create Folder","Delete Folder","Rename","Import Project"], { event: e, callback: function(v) {
			if(v == "Create Folder")
				DriveModule.onCreateFolderInServer( fullpath, function(){ that.refreshTree(); });
			else if(v == "Delete Folder")
				DriveModule.onDeleteFolderInServer( fullpath, function(){ that.refreshTree(); });
			else if(v == "Import Project")
				DriveModule.onImportToFolder( fullpath, function(){ that.refreshTree(); });
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
        item.DOM.listbox.expand();

		if(item.className)
		{
			if( item.bridge && item.bridge.onFolderSelected )
			{
				that.current_folder = item.fullpath;
				that.current_bridge = item.bridge;
				item.bridge.onFolderSelected( item, that );
			}
			else
			{
				that.current_folder = "";
				that.current_bridge = null; //MEMORY
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

//where items are an array of Resources (LS.RM.resources)
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
		title.innerHTML = DriveModule.beautifyPath( options.folder );
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

	var category = DriveModule.getResourceCategory( resource );

	var type = resource.object_class || resource.category || LS.getObjectClassName( resource );
	if(type == "Object") //in server_side resources that dont have category
		type = LS.Formats.guessType( resource.fullpath || resource.filename );
	if(!type)
		type = "unknown";
	element.dataset["restype"] = type;
	element.dataset["category"] = category;

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
		filename = resource.fullpath || "";

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
	var preview = resource._preview_url;
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
                img.style.width = "100%";
				DriveModule.generated_previews[ res_name ] = img;
				preview = img;
			}
		}
	}
	else //if no preview we generate it
	{
		if((resource.in_server || resource.remotepath) )
		{
			preview = DriveModule.getServerPreviewURL( resource );
		}
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
            img.style.width = "100%";
			img.style.maxWidth = 200;
			img.onerror = function() { this.parentNode.removeChild( this ); }
		}
		else
			img = preview;
		element.appendChild(img);
	}
	
	var info = document.createElement("span");
	info.className = "info";
	info.innerHTML = "<span class='category'>" + category + "</span><span class='extension'>." + type_title.toLowerCase() + "</span>";
	element.appendChild(info);

	element.addEventListener("click", item_selected);
	element.addEventListener("dblclick", item_dblclick);


	this.applyFilters([element]);
	parent.appendChild(element);

	//when the resources is clicked
	function item_selected(e)
	{
		var path = element.dataset["fullpath"] || element.dataset["filename"];

		var items = parent.querySelectorAll(".selected");
		for(var i = 0; i < items.length; ++i)
			items[i].classList.remove("selected");
		element.classList.add("selected");
		LiteGUI.trigger( that, "item_selected", element );
		LiteGUI.trigger( that, "resource_selected", path );
		that.selected_item = element;
		window.RESOURCE = LS.RM.getResource( path );
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
		ev.dataTransfer.setData("type", "resource");
	});

	element.addEventListener("contextmenu", function(e) { 
		if(e.button != 2) //right button
			return false;
		that.showItemContextMenu(this,e);
		e.stopImmediatePropagation();
		e.stopPropagation();
		e.preventDefault(); 
		return false;
	});
}

ResourcesPanelWidget.prototype.showItemContextMenu = function( item, event )
{
	var that = this;
	var actions = ["Insert","Load","Rename","Clone","Move","Set as Modifyed","Properties",null,"Delete"];

	var menu = new LiteGUI.ContextMenu( actions, { ignore_item_callbacks: true, event: event, title: "Resource", callback: function(action, options, event) {
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
		else if(action == "Rename")
		{
			DriveModule.showRenameResourceDialog( item.resource );
		}
		else if(action == "Clone")
		{
			DriveModule.showCloneResourceDialog( item.resource );
		}
		else if(action == "Move")
		{
			LiteGUI.alert("Not implemented yet");
		}
		else if(action == "Properties")
		{
			DriveModule.showResourceInfoInDialog( item.resource );
		}
		else if(action == "Set as Modifyed")
		{
			LS.RM.resourceModified( item.resource );
			that.refreshContent();
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

ResourcesPanelWidget.prototype.onTreeUpdated = function()
{
	this.tree_widget.updateTree( DriveModule.tree );
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

ResourcesPanelWidget.prototype.showMemoryResources = function()
{
	this.showInBrowserContent( LS.ResourcesManager.resources );
}

ResourcesPanelWidget.prototype.destroy = function()
{
	LEvent.unbindAll( LS.GlobalScene, this );
	if(this.root.parentNode)
		this.root.parentNode.removeChild( this.root );
}

//Catch events from the LS.Scene to update the tree automatically
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
	{
		this.addItemToBrowser( res );
		//this.refreshContent(); //very slow!
	}
}

ResourcesPanelWidget.prototype.clear = function()
{
	if(!this.tree)
		return;
	this.tree.clear(true);
}

ResourcesPanelWidget.prototype.showContextMenu = function(e){
	var menu = new LiteGUI.ContextMenu( ["Refresh"], { event: event, callback: function(value) {
		if(value == "Refresh")
			this.refresh();
	}});
}

ResourcesPanelWidget.prototype.applyFilters = function( items )
{
	if(!items)
	{
		var parent = this.root.querySelector("ul.file-list");
		items = parent.querySelectorAll(".file-item");
	}

	for(var i = 0; i < items.length; ++i )
	{
		var item = items[i];
		var must_be_filtered = false;

		//filter by name
		var filename = item.dataset["filename"];
		if( this.filter_by_name && filename )
		{
			filename = filename.toLowerCase();
			if( this.filter_by_name && filename.indexOf( this.filter_by_name ) == -1 )
				must_be_filtered = true;
		}

		//filter by category
		var item_category = item.dataset["category"];
		if( this.filter_by_category && item_category )
		{
			item_category = item_category.toLowerCase();
			if( item_category != this.filter_by_category )
				must_be_filtered = true;
		}

		//apply filter
		if(must_be_filtered)
			item.classList.add("filtered");
		else
			item.classList.remove("filtered");
	}
}

ResourcesPanelWidget.prototype.filterByName = function( text )
{
	this.filter_by_name = text ? text.toLowerCase() : null;
	this.applyFilters();
}

ResourcesPanelWidget.prototype.filterByCategory = function( category, skip_widget_update )
{
	this.filter_by_category = category ? category.toLowerCase() : null;
	this.applyFilters();
	if(!skip_widget_update && this.filter_by_category_widget)
		this.filter_by_category_widget.setValue( category );
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

ResourcesPanelWidget.prototype.showFolderContextMenu = function(e)
{
	var that = this;

	var options = [ "Create", "Import", "Refresh" ];

	var menu = new LiteGUI.ContextMenu( options, { event: e, title: "Folder", callback: function(v, info, ev){
		if(v == "Create")
			DriveModule.showCreateNewFileMenu( that.current_folder, ev, menu, inner_refresh);
		else if(v == "Import")
			ImporterModule.showImportResourceDialog(null,{ folder: that.current_folder }, inner_refresh);
		else if(v == "Refresh")
			that.refreshContent(); 
	}});

	function inner_refresh(){
		that.refreshContent(); 
	}
}

