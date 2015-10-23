//Represents the tree view of the Scene Tree, and controls basic events like dragging or double clicking
function ResourcesPanelWidget( id )
{
	var that = this;

	this.root = document.createElement("div");
	this.root.className = "resources-panel";
	this.root.style.width = "100%";
	this.root.style.height = "100%";
	if(id)
		this.root.id = id;

	this.area = new LiteGUI.Area(null);
	this.area.split("horizontal",[300,null]);
	this.area.getSection(0).content.style.overflow = "auto";
	this.area.getSection(0).content.style.backgroundColor = "black";
	this.root.appendChild( this.area.root );

	//tree
	this.createTreeWidget();

	//files
	var files_section = this.area.getSection(1);
	files_section.root.classList.add("file-list");

	//EVENTS
	this.bindEvents();
}


ResourcesPanelWidget.createDialog = function( parent )
{
	var dialog = new LiteGUI.Dialog( null, { title:"Resources", fullcontent: true, closable: true, draggable: true, minimize: true, resizable: true, parent: parent, width: 800, height: 500 });
	var widget = new ResourcesPanelWidget();
	dialog.add( widget );
	dialog.widget = widget;
	dialog.on_close = function()
	{
		widget.unbindEvents();		
	}
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
	var tree_widget = new LiteGUI.Tree( null, this.getTreeData(), {allow_rename:true} );
	tree_widget.root.classList.add("resources-tree");
	tree_widget.root.style.backgroundColor = "black";
	tree_widget.root.style.padding = "5px";
	tree_widget.root.style.width = "100%";
	tree_widget.root.style.height = "100%";
	this.tree_widget = tree_widget;
	var that = this;

	this.area.add( tree_widget );

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
}

//add a new resource to the browser window
ResourcesPanelWidget.prototype.addItemToBrowser = function(resource)
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
}

ResourcesPanelWidget.prototype.refreshTree = function()
{
	this.tree_widget.updateTree( this.tree );
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

ResourcesPanelWidget.prototype.refresh = function()
{
	//TODO
}

