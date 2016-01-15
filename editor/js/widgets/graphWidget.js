function GraphWidget()
{
	this.root = null;
	this.init();
}

GraphWidget.litegraph_path = "../../litegraph/";
GraphWidget.litegraph_css_url = "css/litegraph.css";

GraphWidget.widget_name = "Graph";
CORE.registerWidget( GraphWidget );

GraphWidget.prototype.init = function()
{
	var that = this;

	//create area
	this.root = LiteGUI.createElement("div",null,null,{ width:"100%", height:"100%" });

	//top bar
	var top_widgets = this.top_widgets = new LiteGUI.Inspector( null, { one_line: true });
	top_widgets.addButton(null,"Open", this.onOpenGraph.bind(this) );
	this.root.appendChild( top_widgets.root );

	//create area
	var area = this.area = new LiteGUI.Area(null,{ className: "grapharea", height: -30});
	this.root.appendChild( area.root );

	var canvas = this.canvas = createCanvas(100,100);
	area.add( this.canvas );
	area.content.style.backgroundColor = "#222";

	this.graphcanvas = new LGraphCanvas( this.canvas, null, { autoresize: true } );
	this.graphcanvas.background_image = GraphWidget.litegraph_path + "demo/imgs/grid.png";
	this.graphcanvas.onNodeSelected = this.onNodeSelected.bind(this);
	this.graphcanvas.onShowNodePanel = this.onShowNodePanel.bind(this);
	this.graphcanvas.onDropItem = this.onDropItem.bind(this);

	this.root.addEventListener("DOMNodeInsertedIntoDocument", function(){ 
		that.bindEvents(); 
		setTimeout( function() { that.resizeCanvas(); },10 ); 
	});
	this.root.addEventListener("DOMNodeRemovedFromDocument", function(){ that.unbindEvents(); });
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

GraphWidget.prototype.bindEvents = function()
{
	LEvent.bind( LS.GlobalScene, "nodeRemoved", this.onNodeRemoved, this );
	LEvent.bind( LS.GlobalScene, "nodeComponentRemoved", this.onComponentRemoved, this );
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
}

GraphWidget.prototype.onNodeSelected = function( node )
{
}

GraphWidget.prototype.onShowNodePanel = function( node )
{
	EditorModule.inspect( node );
}

GraphWidget.prototype.onDropItem = function( event )
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
		return;
	}

	if(item_type == "Component")
	{
		var graphnode = LiteGraph.createNode( item_class == "Transform" ? "scene/transform" : "scene/component");
		graphnode.properties.node = item_node_uid;
		graphnode.properties.component = item_uid;
		graphnode.pos[0] = e.canvasX;
		graphnode.pos[1] = e.canvasY;
		this.graph.add( graphnode );
		graphnode.onExecute();
	}

	return false;
}

GraphWidget.prototype.onNodeRemoved = function( node )
{
}

GraphWidget.prototype.onComponentRemoved = function( component )
{
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

LiteGraph.addNodeMethod( "inspect", function( inspector )
{
	var graphnode = this;

	inspector.addSection("Node");
	inspector.addString("Title", graphnode.title, { disabled: graphnode.ignore_rename, callback: function(v) { graphnode.title = v; }});
	inspector.addSeparator();

	var widgets_info = graphnode.constructor.widgets_info || graphnode.widgets_info;

	for(var i in graphnode.properties)
	{
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
		else if(graphnode.properties[i] !== null) //can we guess it from the current value?
		{
			if(typeof(graphnode.properties[i]) == "boolean")
				inspector.addCheckbox(i, graphnode.properties[i], { field_name: i, callback: inner_assign });
			else if(typeof(graphnode.properties[i]) == "string")
				inspector.addString(i, graphnode.properties[i], { field_name: i, callback: inner_assign });
			else if(typeof(graphnode.properties[i]) == "number")
				inspector.addNumber(i, graphnode.properties[i], { step: 0.01, field_name: i, callback: inner_assign });
			else if( graphnode.properties[i].length == 3)
				inspector.addVector3(i, graphnode.properties[i], { step: 0.01, field_name: i, callback: inner_assign });
			else if( graphnode.properties[i].length == 2)
				inspector.addVector2(i, graphnode.properties[i], { step: 0.01, field_name: i, callback: inner_assign });
		}
	}

	if(graphnode.help)
		inspector.addInfo(null, graphnode.help);

	inspector.addSeparator();

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
	}
});



