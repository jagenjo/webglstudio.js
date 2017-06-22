//Represents the tree view of the Scene Tree, and controls basic events like dragging or double clicking
function SceneTreeWidget( options )
{
	options = options || {};

	if(options.constructor === String )
		console.warn( "SceneTreeWidget parameter must be object" );

	var that = this;

	var scene = LS.GlobalScene;

	this.root = document.createElement("div");
	this.root.className = "scene-tree";
	if(options.id)
		this.root.id = options.id;

	this.search = new LiteGUI.SearchBox("", { placeholder: "search...", callback: function(str){
		str = str.trim().toLowerCase();
		that.tree.filterByRule( that.testFilteringRule, str );
	}});

	this.root.appendChild( this.search.root );

	var root_uid = scene.root.uid;

	this.tree = new LiteGUI.Tree( { id: this.getIdString( root_uid ), uid: root_uid, content:"root", precontent: "<span class='nodecontrols'></span>" }, { allow_rename: false, allow_drag: true, allow_multiselection: true } );
	this.content = this.tree;
	this.root.appendChild( this.tree.root );
	this.tree.onContextMenu = function(e){
		that.showContextMenu(e);
	}

	var tree = this.tree;
	this._ignore_events = false; //used to avoid recursions

	this.tree.onBackgroundClicked = function() {
		EditorModule.inspect( LS.GlobalScene ); 
	}

	this.root.addEventListener("DOMNodeInsertedIntoDocument", function(){ 
		that.bindEvents( LS.GlobalScene );
		LEvent.bind( CORE, "global_scene_selected", that.onGlobalSceneSelected, that );
	});
	this.root.addEventListener("DOMNodeRemovedFromDocument", function(){ 
		that.unbindEvents();
		LEvent.unbind( CORE, "global_scene_selected", that.onGlobalSceneSelected, that );
	});


	//bind tree interaction stuff
	this.tree.root.addEventListener("item_selected", onItemSelected.bind(this) );
	this.tree.root.addEventListener("item_add_to_selection", onItemAddToSelection.bind(this) );
	this.tree.root.addEventListener("item_moved", onItemMoved.bind(this) );
	this.tree.root.addEventListener("item_renamed", onItemRenamed.bind(this) ); //renamed from the list
	this.tree.root.addEventListener("item_collapse_change", onItemCollapseChange.bind(this) ); //renamed from the list

	this.tree.root.addEventListener("mousedown", function(){
		LiteGUI.focus_widget = that;
	});

	this.tree.onItemContextMenu = function(e, item_info)
	{
		if(!item_info || !item_info.data)
			return;

		var node_uid = item_info.data.uid;
		var node = LS.GlobalScene.getNodeByUId( node_uid );
		if(!node)
			return;

		EditorModule.showNodeContextMenu(node, e);
		e.preventDefault();
		return false;
	}

	this.bindEvents( LS.GlobalScene );

	function onItemSelected(e)
	{
		if(this._ignore_events) 
			return;

		if(!that._scene)
		{
			console.error("how??!");
			return;
		}

		var info = e.detail;
		if(!info.item) 
			return;

		//data contains the original data passed to create this item in the tree
		var item = info.data;
		var node = null;

		if( item.uid )
		{
			node = that._scene.getNodeByUId( item.uid );
			if(node)
			{
				if(that.trigger_clicks) //special case
					LEvent.trigger( that._scene, "node_clicked", node );
				SelectionModule.setSelection( node );//this triggers the selected_node event
				window.NODE = node;

				if( EditorModule.getInspectedInstance() != node )
					EditorModule.inspect( node );
			}
			else
			{
				console.warn( "Node uid not found in SceneTree: " + item.uid );
				that.tree.removeItem( item.uid );
			}
		}
		else
			SelectionModule.setSelection( that._scene._root );
	}

	function onItemAddToSelection(e)
	{
		if(this._ignore_events) 
			return;

		var info = e.detail;
		if(!info.item) 
			return;

		//data contains the original data passed to create this item in the tree
		var item = info.data;
		var node = null;

		if( item.uid )
		{
			node = that._scene.getNodeByUId( item.uid );
			if(node)
				SelectionModule.addToSelection(node); //this triggers the selected_node event
			else
				that.tree.removeItem( item.uid );
		}
	}

	function onItemMoved(e)
	{
		var info = e.detail;
		var item = info.item;
		var parent_item = info.parent_item;

		if(this._ignore_events) 
			return;

		var node = that._scene.getNode( item.data.uid );
		var parent_node = that._scene.getNode( parent_item.data.uid );
		if(!parent_node) 
			parent_node = that._scene._root;
		if(!node || !parent_node) 
			return;

		//add to node
		this._ignore_events = true; //done to avoid recursive situations
		parent_node.addChild(node,null,true);
		this._ignore_events = false;

		/*
		var parent_node = parent_item.data.id != "scene-root-node" ? Scene.getNode(parent_item.data.node_uid) : null;
		if(node && parent_node)
		{
			parent_node.addChild(node, true);
		}
		else if(node && node.parentNode) //remove from parent
		{
			node.parentNode.removeChild(node, true);
		}
		else
			trace("node not found");
		*/
		RenderModule.requestFrame();
	}

	function onItemRenamed(e)
	{
		if(this._ignore_events)
			return;

		var item_data = e.detail;
		var item = item_data.item;

		var node = that._scene.getNode( data.old_name );
		if(!node) 
			return;
		node.setName( data.new_name );
		item.parentNode.data.node_name = data.new_name;
	}

	function onItemCollapseChange(e)
	{
		if(this._ignore_events)
			return;

		var item_data = e.detail;
		var item = item_data.item;

		var node = that._scene.getNode( item.data.uid );
		if(!node) 
			return;

		if(!node._editor)
			node._editor = {};
		node._editor.collapsed = (item_data.data == "closed");
	}

	this.tree.onDropItem = function( e, item_data )
	{
		var tree_item_uid = item_data.uid;
		var node = LS.GlobalScene.getNode( tree_item_uid );
		if(!node)
			return;
		EditorModule.onDropOnNode( node, event );
	}

	this.refresh();
}

SceneTreeWidget.prototype.getIdString = function(id)
{
	return "uid_" + id.replace(/\W/g, '_');
}

SceneTreeWidget.widget_name = "Scene Tree";

CORE.registerWidget( SceneTreeWidget );

SceneTreeWidget.createDialog = function()
{
	var dialog = new LiteGUI.Dialog( null, { title:"Select Node", fullcontent: true, closable: true, draggable: true, minimize: true, resizable: true, parent: parent, width: 500, height: 500 });
	var widget = new SceneTreeWidget();
	dialog.add( widget );
	dialog.on_close = function()
	{
		widget.unbindEvents();
	}
	return dialog;
}

SceneTreeWidget.prototype.destroy = function()
{
	this.unbindEvents();
	if(this.root.parentNode)
		this.root.parentNode.removeChild( this.root );
}

SceneTreeWidget.prototype.onGlobalSceneSelected = function(e, scene)
{
	if(this._scene == scene)
		return;

	console.log("updating tree after global scene change");
	this.bindEvents( scene );
	this.refresh();
}

SceneTreeWidget.prototype.onKeyDown = function( e )
{
	if(e.keyCode == 8 || e.keyCode == 46)
	{
		EditorModule.removeSelectedNodes(); 
		return false;
	}
}


//Catch events from the LS.SceneTree to update the tree automatically
SceneTreeWidget.prototype.bindEvents = function( scene )
{
	if( !scene || scene.constructor !== LS.SceneTree )
		throw("bindEvents require SceneTree");

	var that = this;
	//scene = scene || LS.GlobalScene;
	if(this._scene && this._scene != scene)
		this.unbindEvents();

	this._scene = scene;

	//Events from the scene

	//Triggered when a new node is attached to the scene tree
	LEvent.bind( scene, "nodeAdded", function(e,node) {
		if(this._ignore_events) 
			return;

		//add to tree
		var node_id = this.addNode( node );

		//special feature, allows to put stuff in the tree that is not directly related to the SceneTree structure
		if(!node.getSpecialTreeChilds)
			return;
		var tree_childs = node.getSpecialTreeChilds();
		for(var i in tree_childs)
		{
			var child = tree_childs[i];
			this.addNode( child, node_id );
		}

	}, this);

	//Triggered when a node is removed from the scene tree
	LEvent.bind( scene, "nodeRemoved", function(e,node) {
		if(this._ignore_events) 
			return;
		
		this.removeNode( node );
	}, this);

	//Triggered when the scene is cleared
	LEvent.bind( scene, "clear", function(e) {
		this.clear();
		SelectionModule.setSelection(null);
		update_root_uid();
	}, this);

	//Triggered when the scene is reloaded
	LEvent.bind( scene, "configure", update_root_uid , this );

	function update_root_uid()
	{
		that.updateRootUID( scene );
	}

	//Triggered when the user selects a node in the scene
	LEvent.bind( scene, "selected_node_changed", function(e,node) { 
		this.tree.setSelectedItem( node ? that.getIdString( node.uid ) : null, true );
	},this);

	//Triggered when the user selects another node in the scene (multi-selection)
	LEvent.bind( scene, "other_node_selected", function(e,node) { 
		this.tree.addItemToSelection(node ? that.getIdString( node.uid ) : null);
	},this);

	//Triggered when the user deselects another node in the scene (multi-selection)
	LEvent.bind( scene, "other_node_deselected", function(e,node) { 
		this.tree.removeItemFromSelection(node ? that.getIdString( node.uid ) : null);
	},this);

	//Triggered when the user deselects another node in the scene (multi-selection)
	LEvent.bind( scene, "node_rearranged", function(e,node) { 
		this.refresh();
	},this);

	//Triggered when ??
	LEvent.bind( scene, "nodeChangeParent", function(e,parent,node) { 
		/* NODE?! no two parameters supported
		if(node && parent)
			this.tree.moveItem( "uid_" + node._uid, "uid_" + parent._uid );
		else if(node)
			this.tree.removeItem( "uid_" + node._uid );
		*/
	},this);

	//Catch if the name of a node has changed to update it in the tree
	LEvent.bind( scene, "node_name_changed", function(e,node) {
		var unique_id = that.getIdString( node.uid );
		this.tree.updateItem( unique_id, { id: unique_id, uid: node.uid, node_name: node._name, content: node.name });
	},this);
	LEvent.bind( scene, "node_uid_changed", function(e,node) {
		//var old_uid = that.getIdString( LS.SceneNode._last_uid_changed );
		//var new_uid = that.getIdString( node.uid );
		//this.tree.updateItem( old_uid, { id: new_uid, uid: node.uid, node_name: node._name, content: node.name });
		that.changeNodeUID( LS.SceneNode._last_uid_changed, node.uid );
	},this);
}

SceneTreeWidget.prototype.unbindEvents = function()
{
	if(this._scene)
		LEvent.unbindAll( this._scene, this );
	this._scene = null;
}

SceneTreeWidget.prototype.clear = function()
{
	if(!this.tree)
		return;
	this.tree.clear(true);
	/*
	if(!this.scene_tree) return;
	$(this.scene_tree.root).remove();
	this.scene_tree = null;
	*/
}

SceneTreeWidget.prototype.showContextMenu = function(e){
	var that = this;
	var menu = new LiteGUI.ContextMenu( ["Refresh","Scene"], { event: event, callback: function(value) {
		if(value == "Refresh")
			that.refresh();
		else if(value == "Scene")
			EditorModule.inspect( LS.GlobalScene );
	}});
}

//Create the object prepared for the LiteGUI.Tree and add some extra controls
SceneTreeWidget.prototype.addNode = function( node, parent_id )
{
	var node_unique_id = this.getIdString( node.uid );

	if(!parent_id && node._parentNode && node._parentNode != this._scene.root )
		parent_id = this.getIdString( node._parentNode.uid );

	var is_selected = SelectionModule.isSelected(node);
	var is_collapsed = node && node._editor ? node._editor.collapsed : false;

	var element = this.tree.insertItem({
			id: node_unique_id,
			uid: node.uid,
			node_name: node._name,
			content: node.name,
			precontent: "<span class='nodecontrols'><span title='visible' class='togglevisible "+(node.flags.visible ? "on":"")+"'></span></span>",
			allow_rename: (parent_id != null),
			onDragData: function(){ 
				return { uid: node._uid, "class": "SceneNode", type: "SceneNode", locator: node._uid, node_name: node._name, node_uid: node._uid };
			}
		}, parent_id, undefined, {selected: is_selected, collapsed: is_collapsed} );
	var that = this;

	if( node.insidePrefab() )
		element.classList.add("prefab");

	//controls
	element.querySelector('.nodecontrols').addEventListener('click', function(e){
		e.stopPropagation();
	});

	//toggle visibility
	element.querySelector('.togglevisible').addEventListener('click', function(e){
		e.stopPropagation();
		if(!element.data)
			return;
		var uid = element.data.uid;
		var node = LS.GlobalScene.getNode( uid );
		if(!node)
			return;
		if( this.classList.contains('on') )
			node.flags.visible = false;		
		else
			node.flags.visible = true;
		this.classList.toggle('on');
		LS.GlobalScene.refresh();
	});

	return node_unique_id;
}

SceneTreeWidget.prototype.removeNode = function(node)
{
	if(!this.tree)
		return;
	var uid = this.getIdString( node.uid );
	this.tree.removeItem( uid, true );
}

SceneTreeWidget.prototype.refresh = function()
{
	if(!this._scene)
		return;

	this.clear();
	var nodes = this._scene.getNodes(true);
	//skip root node
	for(var i = 1; i < nodes.length; ++i)
		this.addNode( nodes[i] );
}

SceneTreeWidget.prototype.serialize = function()
{
	var r = { 
		selected: null,
		collapsed: {}
	};

	var nodes = LS.GlobalScene._nodes;

	for(var i = 0; i < nodes.length; ++i)
	{
		var node = nodes[i];
		var element = this.tree.root.querySelector(".ltreeitem-" + this.getIdString( node.uid ));
		if(!element)
			continue;
		var listbox = element.querySelector(".listbox");
		if(!listbox)
			continue;
		if(listbox.classList.contains("listclosed"))
			r.collapsed[ node.uid ] = true;
	}
	return r;
}

SceneTreeWidget.prototype.configure = function(o)
{
	var nodes = LS.GlobalScene._nodes;
	for(var i = 0; i < nodes.length; ++i)
	{
		var node = nodes[i];
		var element = this.tree.root.querySelector(".ltreeitem-" + this.getIdString( node.uid ));
		if(!element)
			continue;
		var listbox = element.querySelector(".listbox");
		if(!listbox)
			continue;
		if(!o.collapsed[ node.uid ])
			continue;
		listbox.collapse();
	}
}

SceneTreeWidget.prototype.changeNodeUID = function( old_uid, new_uid )
{
	var safe_old_id = this.getIdString( old_uid );
	var safe_new_id = this.getIdString( new_uid );

	var element = this.tree.root.querySelector(".ltreeitem-" + safe_old_id );
	if(!element)
	{
		console.warn("scene tree node not found");
		return;
	}

	if(element.dataset["item_id"] == safe_new_id)
		return;

	//tell all the child nodes the id of the parent has changed
	this.tree.updateItemId( safe_old_id, safe_new_id );

	element.classList.remove("ltreeitem-" + safe_old_id );
	element.classList.add("ltreeitem-" + safe_new_id );
	element.dataset["item_id"] = safe_new_id;
	element.data.uid = new_uid; //this one is the one used for selections
}

SceneTreeWidget.prototype.updateRootUID = function( scene )
{
	scene = scene || LS.GlobalScene;
	var root_uid = scene.root.uid;
	var new_id = this.getIdString( root_uid );
	var element = this.tree.root.querySelector(".root_item");
	if(!element)
		return;
	var old_id = element.data.uid;

	this.changeNodeUID( old_id, root_uid );
}

SceneTreeWidget.prototype.testFilteringRule = function( item, content, str )
{
	var node = LS.GlobalScene.getNode( item.uid );
	if(!node)
		return;

	if(str.length == 0)
		return true;

	if(str[0] == ".")
	{
		var compo_str = str.substr(1);
		for(var i = 0; i < node._components.length; ++i)
		{
			var compo = node._components[i];
			var compo_class = LS.getObjectClassName( compo ).toLowerCase();
			if( compo_class.indexOf( compo_str ) != -1 )
				return true;
		}
	}
	else if( node.name.toLowerCase().indexOf( str ) != -1 )
		return true;

	return false;
}