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

	//filter
	this.filter_str = "";
	this.search = new LiteGUI.SearchBox("", { placeholder: "search...", callback: function(str){
		that.filter_str = str.trim().toLowerCase();
		that.onDraw();
	}});

	this.root.appendChild( this.search.root );

	var root_uid = scene.root.uid;

	this.line_height = 20;
	this.scroll_items = 0;
	this.scroll_x = 0;
	this.mouse = [-1,-1];
	this.prev_selected = new Set();

	this.canvas = document.createElement("canvas");
	this.canvas.width = 100;
	this.canvas.height = 100;
	this.canvas.draggable = true;
	this.root.appendChild( this.canvas );

	this._mouse_callback = this.processMouse.bind(this);
	this._mouse_wheel_callback = this.processMouseWheel.bind(this);
	this._drag_callback = this.processDrag.bind(this);

	this.canvas.addEventListener("mousedown", this._mouse_callback, true ); //down do not need to store the binded
	this.canvas.addEventListener("mousemove", this._mouse_callback );
	this.canvas.addEventListener("mouseup", this._mouse_callback, true ); //down do not need to store the binded
	this.canvas.addEventListener("mousewheel", this._mouse_callback, false);
	this.canvas.addEventListener("mouseleave", this._mouse_callback, false);
	this.canvas.addEventListener("dragstart", this._drag_callback, false);
	this.canvas.addEventListener("mousewheel", this._mouse_wheel_callback, false );
	this.canvas.addEventListener("wheel", this._mouse_wheel_callback, false );
	this.canvas.addEventListener("contextmenu", SceneTreeWidget._doNothing );

	this.visible_nodes = [];

	this.root.addEventListener("DOMNodeInsertedIntoDocument", function(){ 
		that.bindEvents( LS.GlobalScene );
		LEvent.bind( CORE, "global_scene_selected", that.onGlobalSceneSelected, that );
	});
	this.root.addEventListener("DOMNodeRemovedFromDocument", function(){ 
		that.unbindEvents();
		LEvent.unbind( CORE, "global_scene_selected", that.onGlobalSceneSelected, that );
	});

	this.canvas.addEventListener("mousedown", function(){
		LiteGUI.focus_widget = that;
	});

	this.bindEvents( LS.GlobalScene );
	this.refresh();
}

SceneTreeWidget.prototype.onDraw = function()
{
	var canvas = this.canvas;
	var ctx = canvas.getContext("2d");
	var rect = canvas.parentNode.getBoundingClientRect();
	canvas.width = Math.max( rect.width, 100 );
	canvas.height = Math.max( rect.height - 25, 100 );
	ctx.fillStyle = "#111";
	ctx.fillRect(10,10,canvas.width - 20, canvas.height - 20 );

	ctx.font = "14px Tahoma";

	var indent = 20;
	var x = 30;
	var y = 20;
	var line_height = this.line_height;
	var scene = LS.GlobalScene;
	var that = this;

	this.visible_nodes.length = 0;
	var scroll = this.scroll_items;
	var scroll_x = this.scroll_x;
	var mouse = this.mouse;
	var num_items = 0;
	var filter = this.filter_str.length;
	var prev_selected = this.prev_selected;

	var selected_node = SelectionModule.getSelectedNode();
	this.prev_selected.clear();
	if(selected_node)
	{
		var aux = selected_node;
		while( aux = aux._parentNode )
			this.prev_selected.add(aux);
	}

	//first step, collect nodes
	inner( scene.root, 0 );

	this.scroll_items = Math.clamp( this.scroll_items, 0, num_items - 2);

	function inner(node, level)
	{
		var nodes = node._children;
		var has_children = nodes && nodes.length;
		var start_x = x + level * indent + scroll_x;
		var start_y = y;
		var is_selected = SelectionModule.isSelected( node );
		var is_collapsed = node && node._editor ? node._editor.collapsed : false;
		var is_inside_prefab = node.insidePrefab();
		var is_over = mouse[1] > start_y - 10 && mouse[1] < start_y + 10;
		var is_visible = !filter ? true : that.testFilteringRule( node );
		var is_dragged = node == that.dragging_node;
		var is_prev_selected = prev_selected.has(node);
		var is_highlight = that.dragging_node && is_over && !is_dragged;
		num_items++;

		if( scroll <= 0 && is_visible )
		{
			that.visible_nodes.push( [ node, start_x ] );

			if(is_dragged)
			{
				ctx.fillStyle = "#335";
				ctx.fillRect( start_x - 4, y - 14, canvas.width, line_height );
			}
			else if(that.dragging_node && is_over)
			{
				ctx.fillStyle = "#553";
				ctx.fillRect( start_x - 4, y - 14, canvas.width, line_height );
			}
			else if( num_items % 2 == 0 )
			{
				ctx.fillStyle = "#000";
				ctx.fillRect( 0, y - 14, canvas.width, line_height );
			}

			ctx.fillStyle = (is_highlight || is_selected) ? "#FFF" : ( is_over ? "#CCC" : ( is_prev_selected ? "#99B" : "#999" ) );
			ctx.fillText( node.name, start_x + 20, y );

			if(is_selected)
				ctx.fillStyle = "#FFF";
			else if(is_highlight)
				ctx.fillStyle = "#FFF";
			else
				ctx.fillStyle = is_inside_prefab ? "#A63" : "#36A";
			if(node._is_root)
			{
				ctx.fillStyle = "#7C7";
				ctx.fillRect( start_x,y - 10,8,8 );
			}
			else if( !has_children )
			{
				ctx.fillRect( start_x,y - 8,6,6 );
			}
			else if( !is_collapsed ) //V
			{
				ctx.beginPath();
				ctx.moveTo( start_x - 2.5, y - 10);
				ctx.lineTo( start_x + 3.5, y + 2);
				ctx.lineTo( start_x + 9.8, y - 10 );
				ctx.fill();
			}
			else //is_collapsed >
			{
				ctx.beginPath();
				ctx.moveTo( start_x - 2.5, y - 10);
				ctx.lineTo( start_x + 9.5, y - 4 );
				ctx.lineTo( start_x - 2.5, y + 2);
				ctx.fill();
			}

			y += line_height;
			if(y > canvas.height + 10)
				return;
		}
		else
			scroll--;

		if( (!has_children || is_collapsed) && !node._is_root )
			return;

		var child_ys = [];
		var child_outside = false;

		if(nodes)
		for(var i = 0; i < nodes.length; ++i)
		{
			var child_node = nodes[i];
			child_ys.push(y);
			inner( child_node, level + 1 );
			if(y > canvas.height + 10)
			{
				child_outside = true;
				break;
			}
		}

		ctx.strokeStyle = "#666";
		ctx.beginPath();
		ctx.moveTo( start_x + 2.5, start_y + 8);
		var last_y = start_y + 4.5;
		for(var i = 0; i < child_ys.length; ++i)
		{
			if(child_ys[i] == 20)
				continue;

			ctx.lineTo( start_x + 2.5, last_y );
			last_y = child_ys[i] - 4.5;
			ctx.lineTo( start_x + 2.5, last_y );
			ctx.lineTo( start_x + 12.5, last_y );
		}

		if(child_outside && 0)
		{
			ctx.moveTo( start_x + 2.5, start_y - 4.5 );
			ctx.lineTo( start_x + 2.5, canvas.height );
		}
		ctx.stroke();
	}
}

SceneTreeWidget.prototype.processMouse = function(e)
{
	var b = this.canvas.getBoundingClientRect();
	var x = e.pageX - b.left;
	var y = e.pageY - b.top;
	var line_height = this.line_height;
	this.mouse[0] = x;
	this.mouse[1] = y;
	var block = true;
	var now = getTime();

	if(e.type == "mousedown")
	{
		var info = this.visible_nodes[ Math.floor((y - 10) / line_height) ];
		var node = info ? info[0] : null;

		if(e.button == 0) //left
		{
			if( node )
			{
				this.last_click_time = now;
				if( x > info[1] + 10 )
				{
					this.dragging_node = node;
					this.clicked_node = node;
				}
				else if( x > info[1] - 10 )
				{
					if(!node._editor)
						node._editor = {};
					node._editor.collapsed = !node._editor.collapsed;
				}
				block = false;
			}
			else
				this.clicked_node = null;
		}
		else if(e.button == 2) //right
		{
			if(node)
				EditorModule.showNodeContextMenu(node, e);
		}

		this.onDraw();
	}
	else if(e.type == "mousemove")
	{
		this.onDraw();
		var info = this.visible_nodes[ Math.floor((y - 10) / line_height) ];
		if(info)
			this.canvas.style.cursor = "pointer";
		else
			this.canvas.style.cursor = "";
	}
	else if(e.type == "mouseup")
	{
		if(e.button == 0) //left
		{
			e.click_time = now - this.last_click_time;
			if( e.click_time < 200 )
			{
				SelectionModule.setSelection( this.clicked_node );
			}
			else //dragging
			{
				var info = this.visible_nodes[ Math.floor((y - 10) / line_height) ];
				var node = info ? info[0] : null;
				if(node) //parenting
				{
					node.addChild( this.clicked_node );
					this.onDraw();
				}
			
			}
			this.dragging_node = null;
			this.onDraw();
		}
	}
	else if(e.type == "mousewheel")
	{
		
	}
	else if(e.type == "mouseleave")
	{
		if( e.target == this.canvas)
		{
			//console.log("leave");
			this.mouse[1] = -1;
			//this.dragging_node = false;
			this.onDraw();
		}
	}

	if(block)
	{
		e.preventDefault();
		return true;
	}
}

SceneTreeWidget.prototype.processDrag = function(e)
{
	//console.log(e);

	if(!this.dragging_node)
		return;

	var that = this;
	this._drop_callback = this.processDrop.bind(this);
	document.addEventListener("drop",this._drop_callback,true);

	var img = document.createElement("img");
	img.src = "imgs/mini-icon-node.png";
	e.dataTransfer.setDragImage(img, 0, 0);
	e.dataTransfer.setData("item_id", this.dragging_node.uid );
	var node = this.dragging_node;
	var drag_data = { 
		uid: node._uid,
		"class": "SceneNode",
		type: "SceneNode",
		locator: node._uid,
		node_name: node._name,
		node_uid: node._uid
	};

	for(var i in drag_data)
		e.dataTransfer.setData( i, drag_data[i] );
}

SceneTreeWidget.prototype.processDrop = function(e){
	this.dragging_node = null;
	this.onDraw();
	document.removeEventListener("drop",this._drop_callback);
}

SceneTreeWidget.prototype.processMouseWheel = function(e)
{
	var root_element = this.canvas;//e.target;
	var b = root_element.getBoundingClientRect();
	e.mousex = e.pageX - b.left;
	e.mousey = e.pageY - b.top;


	if(e.deltaY)
		this.scroll_items += e.deltaY > 0 ? 1 : -1;
	if(this.scroll_items < 0 )
		this.scroll_items = 0;

	this.onDraw();
	e.preventDefault();
	e.stopPropagation();
	return false;
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


SceneTreeWidget._doNothing = function doNothing(e) { e.preventDefault(); return false; };

//Catch events from the LS.Scene to update the tree automatically
SceneTreeWidget.prototype.bindEvents = function( scene )
{
	if( !scene || scene.constructor !== LS.Scene )
		throw("bindEvents require Scene");

	var that = this;
	//scene = scene || LS.GlobalScene;
	if(this._scene && this._scene != scene)
		this.unbindEvents();

	this._scene = scene;

	//Events from the scene
	LEvent.bind( scene, "preConfigure", this.refresh, this);
	LEvent.bind( scene, "configure", this.refresh, this);

	//Triggered when a new node is attached to the scene tree
	LEvent.bind( scene, "nodeAdded", this.refresh, this);

	//Triggered when a node is removed from the scene tree
	LEvent.bind( scene, "nodeRemoved", this.refresh, this);

	//Triggered when the scene is cleared
	LEvent.bind( scene, "clear", this.refresh, this);

	//Triggered when the user selects a node in the scene
	LEvent.bind( scene, "selected_node_changed", function(e,node){
		this.scrollTo( node );
		this.refresh();
	}, this);

	//Triggered when the user selects another node in the scene (multi-selection)
	LEvent.bind( scene, "other_node_selected", this.refresh, this);

	//Triggered when the user deselects another node in the scene (multi-selection)
	LEvent.bind( scene, "other_node_deselected", this.refresh, this);

	//Triggered when the user deselects another node in the scene (multi-selection)
	LEvent.bind( scene, "node_rearranged", this.refresh, this);

	//Triggered when ??
	LEvent.bind( scene, "nodeChangeParent", this.refresh, this);

	//Catch if the name of a node has changed to update it in the tree
	LEvent.bind( scene, "node_name_changed", this.refresh, this);
}

SceneTreeWidget.prototype.unbindEvents = function()
{
	if(this._scene)
		LEvent.unbindAll( this._scene, this );
	this._scene = null;
	//this.canvas.removeEventListener( "keydown", this._key_callback );
	//document.removeEventListener( "keyup", this._key_callback );
}

SceneTreeWidget.prototype.clear = function()
{
	if(!this.tree)
		return;
	this.tree.clear(true);
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

SceneTreeWidget.prototype.refresh = function()
{
	this.onDraw();
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

SceneTreeWidget.prototype.scrollTo = function( node )
{
	//TODO
}

SceneTreeWidget.prototype.testFilteringRule = function( node )
{
	var str = this.filter_str;
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