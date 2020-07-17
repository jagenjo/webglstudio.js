function GraphWidget( options )
{
	this.root = null;
	this.init( options );
}

GraphWidget.litegraph_path = "../../litegraph/";
GraphWidget.litegraph_css_url = "css/litegraph.css";
GraphWidget.litegraph_background = "imgs/litegraph_grid.png";

GraphWidget.item_drop_types = {}; //.used when droping stuff on a graphcanvas

LGraphCanvas.link_type_colors["Component"] = "#D99";

GraphWidget.widget_name = "Graph";
CORE.registerWidget( GraphWidget );

GraphWidget.prototype.init = function( options )
{
	options = options || {};

	var that = this;

	this.inspector = null;
	this.redraw_canvas = true;
	this.inspected_node = null;

	this.graph_filename_widget = null;

	//create area
	this.root = LiteGUI.createElement("div",null,null,{ width:"100%", height:"100%" });

	if(options.id)
		this.root.id = options.id;

	//top bar
	var top_widgets = this.top_widgets = new LiteGUI.Inspector( { one_line: true });
	top_widgets.addButton(null,"New", { callback: this.onNewGraph.bind(this), width: 50 });
	top_widgets.addButton(null,"Open", { width: 80, callback: this.onOpenGraph.bind(this) } );
	this.graph_filename_widget = top_widgets.addString( "Graph","", { name_width: 50, content_width: 200, width: 250, disabled: true } );
	this.save_graph_widget = top_widgets.addButton(null,"Save", { width: 50, callback: this.saveGraph.bind(this) } );
	this.compile_graph_widget = top_widgets.addButton(null,"Compile", { width: 70, callback: this.compileGraph.bind(this) } );
	top_widgets.addButton(null,"Run Step", this.onStepGraph.bind(this) );
	top_widgets.addCheckbox("Redraw",this.redraw_canvas, { callback: function(v){ that.redraw_canvas = v; } } );
	/* top_widgets.addButton(null,"Overgraph", this.onSelectOvergraph.bind(this) ); */
	top_widgets.addButton(null,"Detach", { width: 80, callback: this.onDetachGraph.bind(this) });

	this.root.appendChild( top_widgets.root );

	//create area
	var area = this.area = new LiteGUI.Area( { className: "grapharea", height: -30});
	this.root.appendChild( area.root );

	var canvas = this.canvas = createCanvas(100,100);
	area.add( this.canvas );
	area.content.style.backgroundColor = "#222";
	this.canvas.parentNode.classList.add( "litegraph" );

	this.graphcanvas = new LGraphCanvas( this.canvas, null, { autoresize: true } );
	this.graphcanvas.background_image = GraphWidget.litegraph_background;
	this.graphcanvas.onNodeSelected = this.onNodeSelected.bind(this);
	this.graphcanvas.onShowNodePanel = this.onShowNodePanel.bind(this);
	this.graphcanvas.onDropItem = this.onDropItem.bind(this);
	this.graphcanvas.onConnectionChange = function() { setTimeout( function(){LS.GlobalScene.refresh();},100); }
	this.graphcanvas.onMouseDown = function(){ LiteGUI.focus_widget = this; }
	this.graphcanvas.onKeyDown = function(e){ return this.processKey(e); }
//	this.graphcanvas.onMenuNodeInputs = this.onMenuNodeInputs.bind(this);
	this.graphcanvas.onMenuNodeOutputs = this.onMenuNodeOutputs.bind(this);
	this.graphcanvas.getExtraMenuOptions = this.onGetExtraMenuOptions.bind(this);
	this.graphcanvas.onDrawLinkTooltip = this.onDrawLinkTooltip.bind(this);
	this.graphcanvas.onAfterChange = this.onAfterGraphModified.bind(this);

	this.root.addEventListener("DOMNodeInsertedIntoDocument", function(){ 
		that.bindEvents(); 
		if(that._old_graph)
			that.graphcanvas.setGraph( that._old_graph );
		setTimeout( function() { that.resizeCanvas(); },10 ); 
	});
	this.root.addEventListener("DOMNodeRemovedFromDocument", function(){ 
		that.unbindEvents();
		that._old_graph = that.graphcanvas.graph;
		that.graphcanvas.setGraph(null);
	});
}

GraphWidget.createDialog = function( parent )
{
	var dialog = new LiteGUI.Dialog( { title:"Graph", fullcontent: true, closable: true, detachable: true, draggable: true, minimize: true, resizable: true, parent: parent, width: 500, height: 500 });
	var graph_widget = new GraphWidget();
	dialog.add( graph_widget );
	dialog.graph_area = graph_widget;
	dialog.on_close = function()
	{
		graph_widget.unbindEvents();		
	}
	return dialog;
}

GraphWidget.prototype.onResize = function()
{
	this.resizeCanvas();
}

GraphWidget.prototype.destroy = function()
{
	this.graphcanvas.setGraph( null );
}

GraphWidget.prototype.bindEvents = function()
{
	LEvent.bind( LS.GlobalScene, "nodeRemoved", this.onNodeRemoved, this );
	LEvent.bind( LS.GlobalScene, "nodeComponentRemoved", this.onComponentRemoved, this );
	LEvent.bind( LS.GlobalScene, "beforeReload", this.onBeforeReload, this );
	LEvent.bind( LS.GlobalScene, "reload", this.onReload, this );

	if( !this._ondraw_func )
		this._ondraw_func = this.onDraw.bind(this)

	requestAnimationFrame( this._ondraw_func  );
}

GraphWidget.prototype.unbindEvents = function()
{
	LEvent.unbindAll( LS.GlobalScene, this );
	LEvent.unbindAll( LS, this );
}

//on draw canvas, not scene
GraphWidget.prototype.onDraw = function()
{
	if(this.root.parentNode)
		requestAnimationFrame( this._ondraw_func );

	//preview
	if(GraphModule._texture_preview && this.inspected_node)
	{
		var widget = GraphModule._texture_preview;
		var tex = null;
		if(this.inspected_node.getPreviewTexture)
			tex = this.inspected_node.getPreviewTexture();
		if(!tex)
			tex = this.inspected_node.getOutputData(0);
		if(!tex || tex.constructor !== GL.Texture)
			widget._texture = null;
		else
		{
			widget.title = this.inspected_node.title;
			widget._texture = tex;
		}
	}
	
	if(!this.redraw_canvas)
		return;
	var canvas = this.graphcanvas.canvas;
	if(!canvas)
		return;
	var rect = canvas.getBoundingClientRect();
	if(rect.width && rect.height)
		this.graphcanvas.setDirty(true);

	if(this.current_graph_info && this.graph && this.graph._version != this.current_graph_info.version && this.current_graph_info.instance && this.current_graph_info.instance.constructor === LS.GraphCode )
	{
		this.current_graph_info.version = this.graph._version;
		LS.RM.resourceModified( this.current_graph_info.instance );
	}
}

GraphWidget.prototype.resizeCanvas = function()
{
	var w = this.canvas.parentNode.offsetWidth;
	var h = this.canvas.parentNode.offsetHeight;
	if( !w || !h )
		return;

	if(this.canvas.width != w || this.canvas.height != h)
	{
		this.graphcanvas.resize(w,h);
		this.graphcanvas.setDirty(true,true);
	}
}

//instance could be a GraphCode or a GraphComponent
GraphWidget.prototype.editInstanceGraph = function( instance, options )
{
	options = options || {};

	this._old_graph = null;

	if(!instance)
	{
		this.current_graph_info = null;
		this.graph = null;
		this.graphcanvas.setGraph( null );
		return;
	}

	var current_graph_info = this.current_graph_info;

	if(current_graph_info)
	{
		if(options.id && current_graph_info.id == options.id)
			return;
		if(!options.id && current_graph_info.instance == instance)
			return;
	}

	//update graph selected
	this.current_graph_info = { instance: instance, options: options };
	this.graph = instance.graph || (instance.getGraph ? instance.getGraph() : null);

	/*
	if( instance.constructor == LS.GraphCode )
	{
		if( instance.graph._version !== undefined )
		this.current_graph_info.version = instance.graph._version;
		this.graph_filename_widget.setValue( instance.filename );
	}
	*/

	if( instance.filename )
	{
		this.save_graph_widget.enable();
		this.graph_filename_widget.setValue( instance.filename );
	}
	else
	{
		this.graph_filename_widget.setValue( "inner graph" );
		this.save_graph_widget.disable();
	}

	this.onNodeSelected(null); //TODO: store old selected node id
	if(!this.graph)
		console.warn("no graph in resource or component");
	this.graphcanvas.setGraph( this.graph );

	if(this.onRename) //used for the title of the tab
	{
		var name = "";
		if(instance)
		{
			if( instance.constructor === LS.GraphCode )
				name = LS.RM.getBasename( instance.fullpath || instance.filename );
			else if (instance._root) 
				name = instance._root.name;
		}
		else
			name = "None";
		this.onRename(name);
	}
}

//a GraphComponent
GraphWidget.prototype.getInstance = function()
{
	if(!this.current_graph_info)
		return null;
	return this.current_graph_info.instance;
}

GraphWidget.prototype.isInstance = function( instance, options )
{
	if(this.current_graph_info && this.current_graph_info.instance == instance)
		return true;
	return false;
}

GraphWidget.prototype.onAfterGraphModified = function()
{
	var component = null;
	var instance = this.getInstance();
	if(!instance || !instance.constructor.is_component)
		return;
	CORE.userAction("component_changed", instance );
}

GraphWidget.prototype.saveGraph = function()
{
	if(!this.current_graph_info)
		return;

	this.compileGraph();

	var instance = this.current_graph_info.instance;
	if( instance.from_file )
	{
		var graphcode = instance.graphcode;
		if(graphcode)
			DriveModule.saveResource( graphcode );
	}
}

GraphWidget.prototype.compileGraph = function()
{
	if(!this.current_graph_info)
		return;

	var instance = this.current_graph_info.instance;
	if( !instance.from_file )
		return;

	var graphcode = instance.graphcode;
	if(!graphcode)
		return;

	//copy changes in this graph to graphcode
	graphcode.data = instance.graph.serialize();

	//propagate to all other graphcomponents using this graphcode
	graphcode.propagate();
}

//node panel defined later in the file, search for "inspect"
GraphWidget.prototype.onShowNodePanel = function( node )
{
	var inspector = this.inspector || EditorModule.inspector;
	inspector.inspect( node, false, node.constructor.type );
	this.inspected_node = node;
}

GraphWidget.prototype.onDetachGraph = function()
{
	//create floating window
	var dialog = InterfaceModule.createFloatingDialog(null, CORE.Widgets_by_name.Graph, true );
	if(this.current_graph_info.instance)
		dialog.widget.editInstanceGraph( this.current_graph_info.instance );
}

//in case you want to have the option to drop stuff in the editor
GraphWidget.registerItemDropType = function( type, callback )
{
	this.item_drop_types[ type ] = callback;
}

GraphWidget.prototype.onDropItem = function( e )
{
	e.preventDefault();
	e.stopPropagation();

	var graph = this.graphcanvas.getCurrentGraph();

	//scene node
	var item_type = e.dataTransfer.getData("type");


	//get function in charge of processing drop
	var callback = GraphWidget.item_drop_types[ item_type ];
	if( !callback )
		return false; 

	if(!graph && item_type == "Component")
	{
		var node_uid = e.dataTransfer.getData("node_uid");
		var uid = e.dataTransfer.getData("uid");
		var node = LS.GlobalScene.getNode(node_uid);
		if(!node)
			return;
		var comp = node.getComponentByUId(uid);
		if(comp && comp.graph)
			graph = comp.graph;
		if(graph)
			this.graphcanvas.setGraph(graph);
		return;
	}

	//in case is a node
	var graphnode = callback(e, graph);
	if(!graph || !graphnode)
		return false;

	//position node
	var s = Math.floor(LiteGraph.NODE_TITLE_HEIGHT * 0.5);
	graphnode.pos[0] = e.canvasX - s;
	graphnode.pos[1] = e.canvasY + s;

	//get active graph
	graph.add( graphnode );
	graphnode.onExecute();
	if(graphnode.getTitle) //refresh title
		graphnode.getTitle();
	return true;
}

GraphWidget.prototype.onBeforeReload = function( e )
{
	//save state
	this._saved_state = this.current_graph_info;
}

GraphWidget.prototype.onReload = function( e )
{
	//restore state
	if(!this._saved_state)
		return;

	var state = this._saved_state;
	var id = null;

	var instance = null;
	if( state.getInstance )
		instance = state.getInstance();
	if(!instance)
	{
		if(state && state.options.id && state.options.id)
			id = state && state.options.id && state.options.id;
		if( id && id.substr(0,6) == "@COMP-" )
			instance = LS.GlobalScene.findComponentByUId( id );
	}
	if(instance)
		this.editInstanceGraph( instance, state.options );
	else
		console.warn("GraphWidget: cannot find instance by uid " + id );
	this._saved_state = null;

	EditorModule.refreshAttributes(); //avoid inspecting old version
}

GraphWidget.prototype.onNodeSelected = function( node )
{
	//TODO
}

GraphWidget.prototype.onNodeRemoved = function( node )
{
	//TODO
}

GraphWidget.prototype.onComponentRemoved = function( component )
{
	//check if this component is the one being edited
	if( !this.current_graph_info || this.current_graph_info.id != component.uid )
		return;
}

/*
GraphWidget.prototype.onMenuNodeInputs = function( options )
{
	options = options || [];
	options.push(null);
	options.push({content:"New action", callback: function( node ){
		LiteGUI.prompt("Enter action name", function(v){
			if(!v)
				return;
			node.addInput( v, LiteGraph.ACTION );
		});
	}});

	return options;
}
*/

GraphWidget.prototype.onMenuNodeOutputs = function( options )
{
	options = options || [];
	options.push(null);
	options.push({content:"New event", className: "event", callback: function( node ){
		LiteGUI.prompt("Enter event name", function(v){
			if(!v)
				return;
			node.addOutput( "on_" + v, LiteGraph.EVENT );
		});
	}});

	return options;
}

GraphWidget.prototype.onNewGraph = function()
{
	var that = this;
	var dialog = new LiteGUI.Dialog( { title:"New Graph", draggable: true, closable: true });
	
	var graph_type = "GraphComponent";
	var node = LS.GlobalScene.root;

	var widgets = new LiteGUI.Inspector();
	widgets.addCombo("Graph Type",graph_type, { values: ["GraphComponent","FXGraphComponent"], callback: function(v) { graph_type = v; }});
	widgets.addNode("Node",node, { use_node: true, callback: function(v) { 
		node = v;
	}});
	widgets.addButton(null,"Create Graph", inner);

	dialog.add( widgets );
	dialog.adjustSize();
	dialog.show( null, this.root );

	function inner(v){
		var component = new LS.Components[ graph_type ]();
		var root = node || LS.GlobalScene.root;
		root.addComponent( component );
		CORE.userAction("component_created", component );
		EditorModule.refreshAttributes();
		that.editInstanceGraph( component, { id: component.uid, title: root.name } );
		dialog.close();
	}
}

GraphWidget.prototype.onOpenGraph = function()
{
	var that = this;
	var dialog = new LiteGUI.Dialog( { title:"Select Graph", draggable: true, closable: true });
	
	var widgets = new LiteGUI.Inspector();
	var selected = null;

	var graph_components = LS.GlobalScene.findNodeComponents( LS.Components.GraphComponent );
	graph_components = graph_components.concat( LS.GlobalScene.findNodeComponents( LS.Components.FXGraphComponent ) );

	var graphs = [];
	for(var i in graph_components)
		graphs.push({ name: graph_components[i]._root.name, component: graph_components[i] });

	widgets.addList(null, graphs, { height: 200, callback: function(value){
		selected = value.component;
	}});

	widgets.addButton(null,"Open Graph", function(){
		if(selected)
		{
			var component = selected;
			var node = component._root;
			that.editInstanceGraph( component, { id: component.uid, title: node.id, path: component.uid });
		}
		dialog.close();
	});


	dialog.add( widgets );
	dialog.adjustSize();
	dialog.show( null, this.root );
}

GraphWidget.prototype.onStepGraph = function()
{
	if(!this.graph)
		return;
	this.graph.runStep(1);
	this.graphcanvas.setDirty(true,true);

	LS.GlobalScene.refresh();
}

GraphWidget.prototype.onSelectOvergraph = function()
{
	GraphModule.current_overgraph = this.graphcanvas.getCurrentGraph();
}

GraphWidget.prototype.onDrawLinkTooltip = function( ctx, link, graphcanvas )
{
	var tex = null;
	if(link && link.data && link.data.constructor === GL.Texture)
		tex = link.data;

	if(GraphModule._link_texture != tex)
	{
		GraphModule._link_texture = tex;
		LS.GlobalScene.requestFrame();
	}
}

GraphWidget.prototype.onGetExtraMenuOptions = function(options)
{
	var selection = SelectionModule.getSelection();
	if(!selection)
		return;
	var instance = selection.instance;
	var locator = null;
	var className = null;
	if(instance.getLocator)
	{
		locator = instance.getLocator();
		className = LS.getObjectClassName( instance );
	}

	return [null,{ content: "Add " + className, callback: inner_add.bind(this) }];

	function inner_add( node, options, e )
	{
		var graphnode = null;

		if(instance.constructor.is_component && selection.node)
		{
			graphnode = LiteGraph.createNode( className == "Transform" ? "scene/transform" : "scene/component");
			graphnode.properties.node = selection.node.uid;
			graphnode.properties.component = instance.uid;
		}
		else if(instance.constructor == LS.SceneNode )
		{
			graphnode = LiteGraph.createNode("scene/node");
			graphnode.properties.node_id = instance.uid;
		}
		else
		{
			LiteGUI.alert("Unknown object");
			return;
		}

		this.graphcanvas.adjustMouseEvent(e);
		graphnode.pos[0] = e.canvasX;
		graphnode.pos[1] = e.canvasY;
		var graph = this.graphcanvas.getCurrentGraph();
		graph.add( graphnode );
		graphnode.onExecute();
	}
}

//here we create a panel
LiteGraph.addNodeMethod( "inspect", function( inspector )
{
	var graphnode = this;

	var icon = "imgs/mini-icon-graph.png";

	var title = inspector.addSection("<img src='"+icon+"' draggable='true'/> Node");
	var icon_img = title.querySelector("img");
	icon_img.addEventListener("dragstart", function(event) { 
		//event.dataTransfer.setData("uid", component.uid);
	});

	inspector.widgets_per_row = 2;
	inspector.addString("Title", graphnode.title, { name_width: 100, disabled: graphnode.ignore_rename, callback: function(v) { graphnode.title = v; }});
	inspector.addString("ID", String(graphnode.id), { name_width: 100 } );
	inspector.widgets_per_row = 1;
	inspector.addVector2("Size", graphnode.size, { name_width: 100, callback: function(v) { graphnode.size[0] = v[0]; graphnode.size[1] = v[1];  }} );

	var modes = { "Always": LiteGraph.ALWAYS, "On Event": LiteGraph.ON_Event, "On Trigger": LiteGraph.ON_TRIGGER, "Never": LiteGraph.NEVER };
	var reversed_modes = {};
	for(var i in modes)
		reversed_modes[ modes[i] ] = i;

	inspector.addCombo("Mode", reversed_modes[ graphnode.mode ], { name_width: 100, values: modes, callback: function(v) { graphnode.mode = v; }});
	inspector.addSeparator();

	var widgets_info = graphnode.constructor.widgets_info || graphnode.widgets_info;

	//special case
	if( graphnode.type == "scene/global" )
	{
		inspector.addString("Name", graphnode.properties.name, { callback: function(v){ graphnode.properties.name = v; }});
		inspector.addCombo("Type", graphnode.properties.name, { values: LGraphGlobal["@type"].values, callback: function(v){
			graphnode.properties.type =	v;
			if( v == "boolean" )
				graphnode.properties.value = !!graphnode.properties.value;
			else if ( v == "number" )
				graphnode.properties.value = 0;
			inspector.refresh();
		}});
		inspector.add( graphnode.properties.type, "Value", graphnode.properties.value, { callback: function(v){} });
		if( graphnode.properties.type == "number" )
		{
			inspector.addNumber( "Min", graphnode.properties.min, { callback: function(v){ graphnode.properties.min = v; } });
			inspector.addNumber( "Max", graphnode.properties.max, { callback: function(v){ graphnode.properties.max = v; } });
		}
	}
	else
	for(var i in graphnode.properties)
	{
		var value = graphnode.properties[i];

		//do we have info?
		if(widgets_info && widgets_info[i])
		{
			var options = widgets_info[i] || {};
			options = LS.cloneObject( options );
			options.field_name = i;
			options.callback = inner_assign;
			inspector.add(widgets_info[i].widget || widgets_info[i].type, i, graphnode.properties[i], options);
		}
		else if(graphnode.constructor["@" + i])
		{
			var options = graphnode.constructor["@" + i] || {type:"number"};
			options = LS.cloneObject( options );
			options.field_name = i;
			options.callback = inner_assign;
			inspector.add( options.widget || options.type, options.title || i, graphnode.properties[i], options );
		}
		else if(value !== null && value !== undefined) //can we guess it from the current value?
		{
			inspector.addDefault( i, graphnode.properties[i], { step: 0.01, field_name: i, callback: inner_assign } );
			/*
			if( value.constructor === Boolean )
				inspector.addCheckbox(i, value, { field_name: i, callback: inner_assign });
			else if( value.constructor === String )
				inspector.addString(i, value, { field_name: i, callback: inner_assign });
			else if( value.constructor === Number )
				inspector.addNumber(i, value, { step: 0.01, field_name: i, callback: inner_assign });
			else if( value.length == 4)
				inspector.addVector4(i, value, { step: 0.01, field_name: i, callback: inner_assign });
			else if( value.length == 3)
				inspector.addVector3(i, value, { step: 0.01, field_name: i, callback: inner_assign });
			else if( value.length == 2)
				inspector.addVector2(i, value, { step: 0.01, field_name: i, callback: inner_assign });
			*/
		}
	}

	if(graphnode.onInspect)
		graphnode.onInspect( inspector );

	inspector.addSeparator();

	inspector.addButtons(null, ["Collapse","Remove","Show JSON"], { callback: function(v) { 
		if(v == "Collapse")
			graphnode.collapse();
		else if(v == "Show JSON")
		{
			EditorModule.checkJSON( graphnode.serialize() );
			console.log( graphnode );
		}
		else if(v == "Remove")
			graphnode.graph.remove(graphnode);
	}});

	if(graphnode.help)
		inspector.addInfo( null, graphnode.help );
	else
		inspector.addInfo( null, graphnode.constructor.desc, { name_width: 100, disabled: graphnode.ignore_rename, callback: function(v) { graphnode.title = v; }});

	if(graphnode.constructor.pixel_shader)
		inspector.addButton(null,"Show Pixel Shader", function(){
			EditorModule.checkCode(	graphnode.constructor.pixel_shader );
		});

	function inner_assign(v)
	{
		//safe way
		graphnode.graph.beforeChange();
		LS.setObjectProperty( graphnode.properties, this.options.field_name, v );
		graphnode._version++;
		graphnode.graph.afterChange();

		if( graphnode.onPropertyChanged )
			graphnode.onPropertyChanged( this.options.field_name, v );

		//special case
		if( this.options.field_name == "widget" )
		{
			inspector.refresh();
			console.log("refreshing");
		}

	}
});

LiteGraph.LGraph.prototype.onGetNodeMenuOptions = function( options, node )
{
	//console.log( options );

	//for preview textures *************************************

	var preview_textures = [];
	if(node.outputs)
		for(var i = 0; i < node.outputs.length; ++i)
		{
			var info = node.getOutputInfo(i);
			if(!info || !info._data || info._data.constructor !== GL.Texture )
				continue;
			preview_textures.push( { content: info.name, texture: info._data });
		}

	if (preview_textures.length)
	{
		options.push( { content: "Preview texture", is_menu: true, callback: inner_show_previews } );
	}

	function inner_show_previews( value, options, e, prev_menu, node )
	{
		var submenu = new LiteGraph.ContextMenu( preview_textures, { parentMenu: prev_menu, event: e, callback: inner_set_preview });
	}

	function inner_set_preview(v)
	{
		console.log("set preview",v);
	}
}

// drop types

GraphWidget.registerItemDropType( "SceneNode", function(e){
	var graphnode = LiteGraph.createNode("scene/node");
	var item_uid = e.dataTransfer.getData("uid");
	graphnode.setProperty("node_id",item_uid);
	return graphnode;
})

GraphWidget.registerItemDropType( "Component", function(e){
	var item_class = e.dataTransfer.getData("class");
	var graphnode = LiteGraph.createNode( item_class == "Transform" ? "scene/transform" : "scene/component");
	var item_node_uid = e.dataTransfer.getData("node_uid");
	graphnode.setProperty("node_id",item_node_uid);
	var item_uid = e.dataTransfer.getData("uid");
	graphnode.setProperty("component_id",item_uid);
	return graphnode;
});

GraphWidget.registerItemDropType( "Material", function(e){
	graphnode = LiteGraph.createNode( "scene/material" );
	var item_node_uid = e.dataTransfer.getData("node_uid");
	graphnode.setProperty("node_id",item_node_uid);
	var item_uid = e.dataTransfer.getData("uid");
	graphnode.setProperty("material_id",item_uid);
	return graphnode;
});

GraphWidget.registerItemDropType( "property", function(e){
	var graphnode = LiteGraph.createNode( "scene/property" );
	graphnode.title = null;
	var item_uid = e.dataTransfer.getData("uid");
	graphnode.setProperty( "locator", item_uid );
	return graphnode;
});

GraphWidget.registerItemDropType( "resource", function(e){
	var filename = e.dataTransfer.getData("res-fullpath");
	var res = LS.ResourcesManager.getResource( filename );
	var graphnode = null;

	var info = LS.Formats.getFileFormatInfo( filename );

	if(info.type == "image")
	{
		graphnode = LiteGraph.createNode( "texture/texture" );
		graphnode.setProperty( "name", filename );
		if(!res)
			LS.ResourcesManager.load( filename );
	}

	return graphnode;
});

GraphWidget.registerItemDropType( "object", function(e){
	LiteGUI.alert("Objects cannot be dragged into the graph");
});
