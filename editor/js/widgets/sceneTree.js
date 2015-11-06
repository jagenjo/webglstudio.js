//Represents the tree view of the Scene Tree, and controls basic events like dragging or double clicking
function SceneTreeWidget( id )
{
	var that = this;

	var scene = LS.GlobalScene;

	this.root = document.createElement("div");
	this.root.className = "scene-tree";
	if(id)
		this.root.id = id;

	this.search = new LiteGUI.SearchBox("", { placeholder: "search...", callback: function(v){
		that.tree.filterByName( v );
	}});

	this.root.appendChild( this.search.root );

	var root_uid = LS.GlobalScene.root.uid;

	this.tree = new LiteGUI.Tree(null, { id: "uid_" + root_uid.replace(/\W/g, ''), uid: root_uid, content:"root", precontent: "<span class='nodecontrols'></span>" }, { allow_rename: false, allow_drag: true, allow_multiselection: true } );
	this.content = this.tree;
	this.root.appendChild( this.tree.root );
	this.tree.onContextMenu = function(e){
		that.showContextualMenu(e);
	}

	var tree = this.tree;
	this._ignore_events = false; //used to avoid recursions


	this.tree.onBackgroundClicked = function() {
		SelectionModule.setSelection(null);
	}

	this.tree.root.addEventListener("item_selected", onItemSelected.bind(this) );
	this.tree.root.addEventListener("item_add_to_selection", onItemAddToSelection.bind(this) );
	this.tree.root.addEventListener("item_moved", onItemMoved.bind(this) );
	this.tree.root.addEventListener("item_renamed", onItemRenamed.bind(this) ); //renamed from the list

	this.tree.onItemContextMenu = function(e, item_info)
	{
		if(!item_info || !item_info.data)
			return;

		var node_uid = item_info.data.uid;
		var node = LS.GlobalScene.getNodeByUId( node_uid );
		if(!node)
			return;

		EditorModule.showContextualNodeMenu(node, e);
		e.preventDefault();
		return false;
	}

	this.bindEvents();

	function onItemSelected(e)
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
			node = LS.GlobalScene.getNodeByUId( item.uid );
			if(node)
			{
				if(that.trigger_clicks) //special case
					LEvent.trigger( LS.GlobalScene, "node_clicked", node );
				SelectionModule.setSelection( node ); //this triggers the selected_node event
			}
			else
			{
				console.warn( "Node uid not found in SceneTree: " + item.uid );
				that.tree.removeItem( item.uid );
			}
		}
		else
			SelectionModule.setSelection( LS.GlobalScene._root );
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
			node = LS.GlobalScene.getNodeByUId( item.uid );
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

		var node = LS.GlobalScene.getNode( item.data.uid );
		var parent_node = LS.GlobalScene.getNode( parent_item.data.uid );
		if(!parent_node) 
			parent_node = LS.GlobalScene._root;
		if(!node || !parent_node) 
			return;

		//add to node
		this._ignore_events = true; //done to avoid recursive situations
		parent_node.addChild(node,null,true);
		this._ignore_events = false;

		/*
		var parent_node = parent_item.data.id != "scene-root-node" ? Scene.getNode(parent_item.data.node_id) : null;
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
		var item = data.item;

		var node = LS.GlobalScene.getNode( data.old_name );
		if(!node) 
			return;
		node.setName( data.new_name );
		item.parentNode.data.node_name = data.new_name;
	}
}

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

//Catch events from the LS.SceneTree to update the tree automatically
SceneTreeWidget.prototype.bindEvents = function()
{
	var that = this;
	var scene = LS.GlobalScene;

	//events
	LEvent.bind( scene, "nodeAdded", function(e,node) {
		if(this._ignore_events) 
			return;

		this.addNode(node);
	}, this);

	LEvent.bind( scene, "nodeRemoved", function(e,node) {
		if(this._ignore_events) 
			return;
		
		this.removeNode(node);
	}, this);

	LEvent.bind( scene, "clear", function(e) {
		this.clear();
		SelectionModule.setSelection(null);
		update_root_uid();
	}, this);

	LEvent.bind( scene, "configure", update_root_uid , this );

	function update_root_uid()
	{
		var root = that.tree.getNodeByIndex(0);
		if(root)
			root.data.uid = LS.GlobalScene.root.uid;
	}


	LEvent.bind( scene, "selected_node_changed", function(e,node) { 
		this.tree.setSelectedItem( node ? "uid_" + node.uid.replace(/\W/g, '') : null, true );
	},this);

	LEvent.bind( scene, "other_node_selected", function(e,node) { 
		this.tree.addItemToSelection(node ? "uid_" + node.uid.replace(/\W/g, '') : null);
	},this);

	LEvent.bind( scene, "other_node_deselected", function(e,node) { 
		this.tree.removeItemFromSelection(node ? "uid_" + node.uid.replace(/\W/g, '') : null);
	},this);


	LEvent.bind( scene, "nodeChangeParent", function(e,parent,node) { 
		/* NODE?! no two parameters supported
		if(node && parent)
			this.tree.moveItem( "uid_" + node._uid, "uid_" + parent._uid );
		else if(node)
			this.tree.removeItem( "uid_" + node._uid );
		*/
	},this);

	//catch id change so we can update the text in the html with the name
	LEvent.bind( scene, "node_name_changed", function(e,node) {
		var unique_id = "uid_" + node.uid.replace(/\W/g, '');
		this.tree.updateItem( unique_id, {id: unique_id, uid: node.uid, node_name: node._name, content: node.name });
	},this);
}

SceneTreeWidget.prototype.unbindEvents = function()
{
	LEvent.unbindAll( LS.GlobalScene, this );
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

SceneTreeWidget.prototype.showContextualMenu = function(e){
	var menu = new LiteGUI.ContextualMenu( ["Refresh"], { event: event, callback: function(value) {
		if(value == "Refresh")
			this.refresh();
	}});
}

//add node to tree
SceneTreeWidget.prototype.addNode = function(node)
{
	var node_unique_id = "uid_" + node.uid.replace(/\W/g, '');

	var parent_id = null;
	if(node._parentNode && node._parentNode != LS.GlobalScene.root)
		parent_id = "uid_" + node._parentNode.uid.replace(/\W/g, '');

	var is_selected = SelectionModule.isSelected(node);

	var element = this.tree.insertItem({
			id: node_unique_id,
			uid: node.uid,
			node_name: node._name,
			content: node.name,
			precontent: "<span class='nodecontrols'><span class='togglevisible "+(node.flags.visible ? "on":"")+"'></span></span>",
			allow_rename: (parent_id != null),
			onDragData: function(){ 
				return { node_name: node._name, node_id: node._uid }
			}
		}, parent_id, undefined, {selected: is_selected} );
	var that = this;

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
}

SceneTreeWidget.prototype.removeNode = function(node)
{
	if(!this.tree) return;
	var uid = node.uid.replace(/\W/g, '');
	this.tree.removeItem( "uid_" + uid );
}

SceneTreeWidget.prototype.refresh = function()
{
	this.clear();
	var nodes = LS.GlobalScene.getNodes();
	for(var i = 0; i < nodes.length; ++i)
		this.addNode( nodes[i] );
}

