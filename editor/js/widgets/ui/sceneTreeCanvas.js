//Represents the tree view of the Scene Tree, and controls basic events like dragging or double clicking
//this one is rendered using a canvas instead of HTML, it is way faster
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

	this.font = "14px Tahoma";
	this.line_height = 20;
	this.indent = 20;
	this.scroll_distance = 2; //num items scrolled per wheel spin
	this.num_items = 1;
	this.scroll_items = 0;
	this.scroll_x = 0;
	this.mouse = [-1,-1];
	this.prev_selected = new Set();
	this.dragging_scroll = false;
	this.locked = false;
	this.max_visible_items = 1;

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
	//this.canvas.addEventListener("mousewheel", this._mouse_callback, false);
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

	ctx.font = this.font || "14px Tahoma";

	var indent = this.indent;
	var line_height = this.line_height;
	var scene = LS.GlobalScene;
	var that = this;

	var scroll_x = this.scroll_x;
	var mouse = this.mouse;
	var num_items = 0;
	var filter = this.filter_str.length;
	var prev_selected = this.prev_selected;
	var visible_nodes = this.visible_nodes;
	visible_nodes.length = 0;

	var selected_node = SelectionModule.getSelectedNode();
	this.prev_selected.clear();
	if(selected_node)
	{
		var aux = selected_node;
		while( aux = aux._parentNode )
			this.prev_selected.add(aux);
	}

	//first step, collect nodes
	var scroll = this.scroll_items;
	var max_items = this.max_visible_items = Math.ceil((canvas.height - 20) / line_height);
	var last_item = max_items + scroll;
	inner_fetch( scene.root, 0, -1 );
	this.num_items = num_items;

	this.scroll_items = Math.clamp( this.scroll_items, 0, num_items - 2);
	if(this.scroll_items < 0)
		this.scroll_items = 0;

	//then render
	var x = 30;
	var y = 20;
	for(var i = this.scroll_items, l = visible_nodes.length; i < l; ++i )
	{
		var info = visible_nodes[i];
		var node = info[0];
		var level = info[2];
		var child_nodes = node._children;
		var has_children = child_nodes && child_nodes.length;
		var start_x = x + level * indent + scroll_x;
		var start_y = y;
		var is_selected = SelectionModule.isSelected( node );
		var is_collapsed = node && node._editor ? node._editor.collapsed : false;
		var is_inside_prefab = node.insidePrefab();
		var is_over = mouse[1] > start_y && mouse[1] < start_y + line_height;
		var is_under = is_over && mouse[1] >= start_y + line_height - 4;
		var is_visible = !filter ? true : that.testFilteringRule( node );
		var is_dragged = node == that.dragging_node;
		var is_prev_selected = prev_selected.has(node);
		var is_highlight = that.dragging_node && is_over && !is_dragged;

		if(is_dragged)
		{
			ctx.fillStyle = "#335";
			ctx.fillRect( start_x - 4, y, canvas.width, line_height );
		}
		else if(that.dragging_node && is_over)
		{
			ctx.fillStyle = "#542";
			if(is_under)
				ctx.fillRect( start_x - 4, y + line_height - 4, canvas.width, 4 );
			else
				ctx.fillRect( start_x - 4, y, canvas.width, line_height );
		}
		else if( i % 2 == 0 )
		{
			ctx.fillStyle = "#000";
			ctx.fillRect( 0, y, canvas.width, line_height );
		}

		ctx.fillStyle = (is_highlight || is_selected) ? "#FFF" : ( is_over ? "#CCC" : ( is_prev_selected ? "#99B" : "#999" ) );
		ctx.fillText( node.name, start_x + 20, y + line_height * 0.7 );

		if(is_selected)
			ctx.fillStyle = "#FFF";
		else if(is_highlight)
			ctx.fillStyle = "#FFF";
		else
			ctx.fillStyle = is_inside_prefab ? "#A63" : "#36A";
		var center_y = Math.floor(y + line_height * 0.5) + 0.5;
		if(node._is_root)
		{
			ctx.fillStyle = "#7C7";
			ctx.fillRect( start_x,center_y - 4,8,8 );
		}
		else if( !has_children )
		{
			ctx.fillRect( start_x, center_y - 3,6,6 );
		}
		else if( !is_collapsed ) //V
		{
			ctx.beginPath();
			ctx.moveTo( start_x - 2.5, center_y - 6);
			ctx.lineTo( start_x + 3.5, center_y + 6);
			ctx.lineTo( start_x + 9.8, center_y - 6);
			ctx.fill();
		}
		else //is_collapsed >
		{
			ctx.beginPath();
			ctx.moveTo( start_x - 2.5, center_y - 6);
			ctx.lineTo( start_x + 9.5, center_y );
			ctx.lineTo( start_x - 2.5, center_y + 6 );
			ctx.fill();
		}

		y += line_height;
	}

	//render lines
	/*
	var x = 30;
	var y = Math.floor(20 - line_height * 0.25) + 0.5;
	ctx.strokeStyle = "white";
	ctx.beginPath();
	for(var i = 0, l = visible_nodes.length; i < l; ++i )
	{
		var info = visible_nodes[i];
		var node = info[0];
		var level = info[2];
		var child_nodes = node._children;
		var has_children = child_nodes && child_nodes.length;
		var start_x = x + level * indent + scroll_x;
		ctx.moveTo(start_x - indent, y );
		ctx.lineTo(start_x, y );
		if (info[3] == -1)
			ctx.lineTo(start_x, canvas.height );
		//else if (info[3] != 0)
		//	ctx.lineTo(start_x, y + info[2] * line_height );
		if (info[4] == -1)
		{
			ctx.moveTo(start_x, 0 );
			ctx.lineTo(start_x, y );
		}

		y += line_height;
	}
	ctx.stroke();
	*/

	//render scroll
	if( this.scroll_items || num_items * line_height > canvas.height )
	{
		ctx.fillStyle = "#999";
		ctx.fillRect( canvas.width - 10, (this.scroll_items / num_items) * canvas.height, 10, (max_items / num_items) * canvas.height);
	}

	//fetch all nodes
	function inner_fetch( node, level, parent_index )
	{
		var child_nodes = node._children;
		var has_children = child_nodes && child_nodes.length;
		var is_collapsed = node && node._editor ? node._editor.collapsed : false;
		var is_visible = !filter ? true : that.testFilteringRule( node );
		var item_num = num_items;
		++num_items;

		var visible_info = null;

		if( is_visible ) //scroll <= 0 && 
		{
			visible_info = [ node, item_num, level, 0, parent_index ]; //[ node, index, depth_level, last_child_lines, parent_index ]
			visible_nodes.push( visible_info );
			//if(num_items >= last_item)
			//	return visible_info;
		}
		else
			scroll--;

		if( (!has_children || is_collapsed) && !node._is_root )
			return;

		var child_outside = false;
		if(child_nodes)
			for(var i = 0; i < child_nodes.length; ++i)
			{
				var child_node = child_nodes[i];
				var child_visible_info = inner_fetch( child_node, level + 1, item_num );
				/*
				if(child_visible_info && visible_info)
				{
					visible_info[3] = item_num - child_visible_info[1] - 1;
					child_visible_info[4] = item_num;
				}
				*/
				if(num_items >= last_item)
				{
					if( i < child_nodes.length - 1)
						child_outside = true;
					//break;
				}
			}

		if(child_outside && visible_info)
			visible_info[3] = -1;
		return visible_info;
	}
}

SceneTreeWidget.prototype.getItemAtPos = function(y)
{
	var margin_y = 20;
	var line_height = this.line_height;
	var row = Math.floor((y - margin_y) / line_height);
	return this.visible_nodes[ row  + this.scroll_items ];
}

SceneTreeWidget.prototype.processMouse = function(e)
{
	var b = this.canvas.getBoundingClientRect();
	var x = e.pageX - b.left;
	var y = e.pageY - b.top;
	var margin_y = 20;
	var line_height = this.line_height;
	this.mouse[0] = x;
	this.mouse[1] = y;
	var block = true;
	var now = getTime();

	if(e.type == "mousedown")
	{
		var info = this.getItemAtPos(y);
		var node = info ? info[0] : null;

		if(e.button == 0) //left
		{
			this.dragging_scroll = false;

			if( x >= this.canvas.width - 10 )
			{
				this.dragging_scroll = true;
				var f = Math.clamp( y / this.canvas.height,0,1);
				this.drag_scroll_start = y;
			}
			else
			{
				if( node )
				{
					this.last_click_time = now;
					var level = info[2];
					var start_x = 30 + level * this.indent + this.scroll_x;
					if( x > start_x + 10 )
					{
						this.dragging_node = node;
						this.clicked_node = node;
					}
					else if( x > start_x - margin_y ) //collapse
					{
						this.last_click_time = 0; //avoid mouseup
						if(!node._editor)
							node._editor = {};
						node._editor.collapsed = !node._editor.collapsed;
					}
					block = false;
				}
				else
					this.clicked_node = null;
			}
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
		if( this.dragging_scroll )
		{
			var scroll_y = y - this.drag_scroll_start;
			var f = Math.clamp( scroll_y / this.canvas.height,0,1);
			this.scroll_items = Math.floor( f * this.num_items );
		}
		else if( this.dragging_node )
		{
			if( y < 30 )
				this.scroll_items--;
			else if( y > this.canvas.height - 30 )
				this.scroll_items++;
		}

		this.onDraw();
		var info = this.visible_nodes[ Math.floor((y - margin_y) / line_height) ];
		if(info)
			this.canvas.style.cursor = "pointer";
		else
			this.canvas.style.cursor = "";
	}
	else if(e.type == "mouseup")
	{
		if(e.button == 0) //left
		{
			if( this.dragging_scroll )
			{
				this.dragging_scroll = false;
			}
			else
			{
				e.click_time = now - this.last_click_time;
				if( e.click_time < 200 )
				{
					if(e.shiftKey)
						SelectionModule.addToSelection( this.clicked_node );
					else
						SelectionModule.setSelection( this.clicked_node );
					EditorModule.inspect( this.clicked_node );
				}
				else if( this.dragging_node ) //dragging
				{
					var index = Math.floor((y - margin_y) / line_height);
					index += this.scroll_items;
					var local_y = (y - margin_y) % line_height;
					var info = this.visible_nodes[ index ];
					var node = info ? info[0] : null;
					if(node && node != this.clicked_node) //parenting
					{
						if( local_y > line_height - 4 && node.parentNode)
						{
							var node_index = node.parentNode._children.indexOf( node );
							this.onChangeParent( this.clicked_node, node.parentNode, node_index + 1 );
						}
						else
							this.onChangeParent( this.clicked_node, node );
						this.onDraw();
					}
				
				}
				this.dragging_node = null;
			}
			this.onDraw();
		}
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

SceneTreeWidget.prototype.onChangeParent = function(node, parent, index )
{
	if(node == parent)
		return;
	if(node.parentNode == parent && index == null) //nothing to do
		return;

	CORE.userAction("node_parenting", node);
	var global = node.transform.getGlobalMatrix();
	if(index != null)
	{
		if( node.parentNode == parent ) //when dragging to another pos in the same parent, if after its current position take into account that before 
		{
			var current_index = parent._children.indexOf(node);
			if( current_index == index )
				return;
			if(current_index < index)
				index--;
			parent._children.splice(current_index,1);
			parent._children.splice(index,0,node);
			console.log("changing order in children");
		}
		else
			parent.addChild( node, index );
	}
	else
		parent.addChild( node );
	node.transform.fromMatrix(global,true);
	console.log("changing parent");
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

//drop from outside to the canvas
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
		this.scroll_items += e.deltaY > 0 ? this.scroll_distance : -this.scroll_distance;
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
	LEvent.bind( scene, "preConfigure", function(e,node) {
		that.locked = true;
	}, this);

	LEvent.bind( scene, "configure", function(e,node) {
		that.locked = false;
		that.refresh();
	}, this);

	//Triggered when a new node is attached to the scene tree
	LEvent.bind( scene, "nodeAdded", this.refresh, this);

	//Triggered when a node is removed from the scene tree
	LEvent.bind( scene, "nodeRemoved", this.refresh, this);

	//Triggered when the scene is cleared
	LEvent.bind( scene, "clear", this.refresh, this);

	//Triggered when the user selects a node in the scene
	LEvent.bind( scene, "selected_node_changed", function(e,node){
		if(!node)
			return;
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
	if(!this.locked)
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
		if(node && node._editor && node._editor.collapsed)
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
		if(!node._editor)
			node._editor = {};
		if(o.collapsed[ node.uid ])
			node._editor.collapsed = true;
	}
}

SceneTreeWidget.prototype.scrollTo = function( node )
{
	//find node in list
	var visible_nodes = this.visible_nodes;
	var ancestors = node.getAncestors(true);

	for(var j = 0; j < ancestors.length; ++j)
	{
		var aux = ancestors[j];
		for(var i = 0; i < visible_nodes.length; ++i)
		{
			if( visible_nodes[i][0] != aux )
				continue;
			if( i > this.scroll_items && i - this.scroll_items < this.max_visible_items )
				return;
			this.scroll_items = Math.max(0,i - 4);
			return;
		}
	}
	return;
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