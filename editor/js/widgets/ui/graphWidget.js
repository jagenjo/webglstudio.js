function GraphWidget( options )
{
	this.root = null;
	this.init( options );
}

GraphWidget.litegraph_path = "../../litegraph/";
GraphWidget.litegraph_css_url = "css/litegraph.css";
GraphWidget.litegraph_background = "imgs/litegraph_grid.png";

LGraphCanvas.link_type_colors["Component"] = "#D99";

GraphWidget.widget_name = "Graph";
CORE.registerWidget( GraphWidget );

GraphWidget.prototype.init = function( options )
{
	options = options || {};

	var that = this;

	this.inspector = null;

	//create area
	this.root = LiteGUI.createElement("div",null,null,{ width:"100%", height:"100%" });

	if(options.id)
		this.root.id = options.id;

	//top bar
	var top_widgets = this.top_widgets = new LiteGUI.Inspector( null, { one_line: true });
	top_widgets.addButton(null,"New", { callback: this.onNewGraph.bind(this), width: 50 });
	top_widgets.addButton(null,"Open", this.onOpenGraph.bind(this) );
	top_widgets.addButton(null,"Run Step", this.onStepGraph.bind(this) );
	/* top_widgets.addButton(null,"Overgraph", this.onSelectOvergraph.bind(this) ); */
	this.root.appendChild( top_widgets.root );

	//create area
	var area = this.area = new LiteGUI.Area(null,{ className: "grapharea", height: -30});
	this.root.appendChild( area.root );

	var canvas = this.canvas = createCanvas(100,100);
	area.add( this.canvas );
	area.content.style.backgroundColor = "#222";

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
	var dialog = new LiteGUI.Dialog( null, { title:"Graph", fullcontent: true, closable: true, detachable: true, draggable: true, minimize: true, resizable: true, parent: parent, width: 500, height: 500 });
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

GraphWidget.prototype.unbindEvents = function()
{
	LEvent.unbindAll( LS.GlobalScene, this );
	LEvent.unbindAll( LS, this );
}

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
	this.onNodeSelected(null); //TODO: store old selected node id
	this.graph = instance.getGraph() || instance.graph;
	this.graphcanvas.setGraph( this.graph );

	if(this.onRename)
		this.onRename( (instance && instance._root) ? instance._root.name : "Empty");
}

GraphWidget.prototype.isInstance = function(instance, options)
{
	if(this.current_graph_info && this.current_graph_info.instance == instance)
		return true;
	return false;
}

GraphWidget.prototype.onShowNodePanel = function( node )
{
	var inspector = this.inspector || EditorModule.inspector;
	inspector.inspect( node );
}

GraphWidget.prototype.onDropItem = function( e )
{
	e.preventDefault();
	e.stopPropagation();

	if(!this.graph)
		return;

	//scene node
	var item_uid = e.dataTransfer.getData("uid");
	var item_type = e.dataTransfer.getData("type");
	var item_class = e.dataTransfer.getData("class");
	var item_node_uid = e.dataTransfer.getData("node_uid");

	if(item_type == "SceneNode")
	{
		var graphnode = LiteGraph.createNode("scene/node");
		graphnode.properties.node_id = item_uid;
		graphnode.pos[0] = e.canvasX;
		graphnode.pos[1] = e.canvasY;
		this.graph.add( graphnode );
		graphnode.onExecute();
		return true;
	}
	else if(item_type == "Component")
	{
		var graphnode = LiteGraph.createNode( item_class == "Transform" ? "scene/transform" : "scene/component");
		graphnode.properties.node_id = item_node_uid;
		graphnode.properties.component_id = item_uid;
		graphnode.pos[0] = e.canvasX;
		graphnode.pos[1] = e.canvasY;
		this.graph.add( graphnode );
		graphnode.onExecute();
		return true;
	}
	else if(item_type == "property")
	{
		var graphnode = LiteGraph.createNode( "scene/property" );
		graphnode.properties.locator = item_uid;
		graphnode.pos[0] = e.canvasX;
		graphnode.pos[1] = e.canvasY;
		this.graph.add( graphnode );
		graphnode.onExecute();
		return true;
	}

	return false;
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
	var dialog = new LiteGUI.Dialog(null,{ title:"New Graph", draggable: true, closable: true });
	
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
		var component = new LS.Components[graph_type]();
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
	var dialog = new LiteGUI.Dialog(null,{ title:"Select Graph", draggable: true, closable: true });
	
	var widgets = new LiteGUI.Inspector();

	/*
	widgets.addTitle("New Script");
	widgets.addNode("Node", LS.GlobalScene.root.name );
	widgets.addString("Name","unnamed");
	widgets.addButton(null,"Create", function(){
		//TODO
		dialog.close();
	});

	widgets.addTitle("Open Script");
	*/

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
	GraphModule.current_overgraph = this.graph;
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

	function inner_add( node, e )
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
		this.graph.add( graphnode );
		graphnode.onExecute();
	}
}

LiteGraph.addNodeMethod( "inspect", function( inspector )
{
	var graphnode = this;

	inspector.addSection("Node");
	inspector.addString("Title", graphnode.title, { disabled: graphnode.ignore_rename, callback: function(v) { graphnode.title = v; }});
	var modes = { "Always": LiteGraph.ALWAYS,"On Trigger": LiteGraph.ON_TRIGGER,"Never": LiteGraph.NEVER };
	var reversed_modes = {};
	for(var i in modes)
		reversed_modes[ modes[i] ] = reversed_modes[i];

	inspector.addCombo("Mode", reversed_modes[ graphnode.mode ], { values: modes, callback: function(v) { graphnode.mode = v; }});
	inspector.addString("ID", String(graphnode.id) );
	inspector.addSeparator();

	var widgets_info = graphnode.constructor.widgets_info || graphnode.widgets_info;

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

	if(graphnode._inspect)
		graphnode._inspect( inspector );

	if(graphnode.help)
		inspector.addInfo( null, graphnode.help );

	inspector.addSeparator();

	if( graphnode.constructor == LGraphSceneNode )
	{
		inspector.addButton(null, "Inspect node", function(){
			var node = graphnode.getNode();
			if(node)
				EditorModule.inspect( node );
		});
	}

	if( graphnode.constructor == LGraphComponent )
	{
		inspector.addButton(null, "Inspect Component", function(){
			var compo = graphnode.getComponent();
			if(!compo)
				return;
			EditorModule.inspect( compo );
		});
	}

	inspector.addButtons(null, ["Collapse","Remove"], { callback: function(v) { 
		if(v == "Collapse")
			graphnode.collapse();
		else if(v == "Remove")
			graphnode.graph.remove(graphnode);
	}});

	function inner_assign(v)
	{
		//safe way
		LS.setObjectProperty( graphnode.properties, this.options.field_name, v );
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



