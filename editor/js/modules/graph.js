var GraphModule = {
	name: "Graph",
	bigicon: "imgs/tabicon-graph.png",
	_force_render: false,

	current_graph_info: null,

	litegraph_path: "../../litegraph/",
	litegraph_css_url: "css/litegraph.css",
	graph_windows: [],

	init: function()
	{
		this.tab = LiteGUI.main_tabs.addTab( this.name, {id:"graphtab", bigicon: this.bigicon, size: "full",  module: GraphModule, callback: function(tab) {
			GraphModule.openTab();
			InterfaceModule.setSidePanelVisibility(false);
			GraphModule._force_render = true;
			GraphModule.graphcanvas.pause_rendering = false;
		},
		callback_leave: function(tab) {
			//not visible
			GraphModule._force_render = false;
			GraphModule.graphcanvas.pause_rendering = true;
		}});

		RenderModule.viewport3d.addModule(this);

		LiteGraph.node_images_path = this.litegraph_path + "/nodes_data/";

		this.root = LiteGUI.main_tabs.root.querySelector("#graphtab");

		this.buildGUI();
		LiteGUI.requireCSS([ this.litegraph_css_url ]);

		//events that affect graphs
		LEvent.bind( LS.GlobalScene, "update", function(e,dt) { GraphModule.onUpdate(dt); });
		LEvent.bind( LS.GlobalScene, "clear", this.onClear.bind(this) );
		LEvent.bind( LS.GlobalScene, "beforeReload", this.onBeforeReload.bind(this) );
		LEvent.bind( LS.GlobalScene, "reload", this.onReload.bind() );
		LEvent.bind( LS.GlobalScene, "nodeRemoved", this.onNodeRemoved.bind(this) );
		LEvent.bind( LS.GlobalScene, "nodeComponentRemoved", this.onComponentRemoved.bind(this) );
	},

	buildGUI: function()
	{
		var area = new LiteGUI.Area("graphsarea",{content_id:""});
		this.root.appendChild(area.root);
		area.split("horizontal",[null,"230px"],true);

		// TREE AREA **********************************
		area.sections[1].content.innerHTML = "";
		this.inspector = new LiteGUI.Inspector();
		this.inspector.onchange = function()
		{
			GraphModule.graphcanvas.setDirty(true,true);
			RenderModule.requestFrame();
		}
		area.sections[1].content.appendChild(this.inspector.root);
		this.inspector.addInfo("select a node to see its properties");

		// CANVAS AREA *******************************
		var graph_tabs = new LiteGUI.Tabs("graphstabs", {});
		area.getSection(0).add( graph_tabs );
		graph_tabs.root.style.marginTop = "4px";
		graph_tabs.root.style.backgroundColor = "#111";
		this.graph_tabs = graph_tabs;

		var canvas = createCanvas(100,100);
		this.canvas = canvas;
		area.getSection(0).add( this.canvas );
		area.getSection(0).content.style.backgroundColor = "#222";

		LiteGraph.throw_errors = true;
		this.graphcanvas = new LGraphCanvas(this.canvas, null );
		this.graphcanvas.background_image = this.litegraph_path + "demo/imgs/grid.png";
		this.graphcanvas.onNodeSelected = function(node) { GraphModule.onNodeSelected(node); };

		$(LiteGUI).bind("resized", function(e ) { 
			var rect = GraphModule.canvas.parentNode.getClientRects()[0];
			if(rect)
				GraphModule.graphcanvas.resize( rect.width, rect.height );
		});
	},

	openTab: function()
	{
		LiteGUI.main_tabs.selectTab("Graph");
		var rect = this.canvas.parentNode.getClientRects()[0];
		this.graphcanvas.resize( rect.width, rect.height );
		this.updateSidebar();
	},

	closeTab: function()
	{
		LiteGUI.main_tabs.selectTab("Scene");
	},

	editInstanceGraph: function(instance, options)
	{
		options = options || {};

		if(!instance)
			return;

		var current_graph_info = this.current_graph_info;

		if( current_graph_info && current_graph_info.instance == instance )
			return;

		//changing from one tab to another? save state of old tab
		if( current_graph_info )
		{
			//changing from one graph to another
			//nothing to do
		}

		var id = options.id || instance.uid || instance.id;
		var title = options.title || id;

		//check for existing tab with this instance
		var tab = this.graph_tabs.getTab(id);
		if(tab)
			this.graph_tabs.selectTab( id ); //this calls onTabClicked
		else
		{
			tab = this.graph_tabs.addTab( id, { title: title, instance: instance, selected: true, closable: true, callback: onTabClicked, onclose: onTabClosed, skip_callbacks: true  });
			tab.graph_info = { id: id, instance: instance, options: options };
		}

		//update graph selected
		this.current_graph_info = tab.graph_info;
		this.onNodeSelected(null); //TODO: store old selected node id
		this.graph = this.current_graph_info.instance.getGraph();
		this.graphcanvas.setGraph( this.graph );
		for(var i in this.graph_windows)
			this.graph_windows[i].graphcanvas.setGraph(this.graph);

		//callbacks ******************************
		function onTabClicked()
		{
			GraphModule.editInstanceGraph( instance, options ); 
		}

		function onTabClosed(tab)
		{
			if(tab.selected)
				GraphModule.editInstanceGraph(null); 
		}
	},

	closeInstanceTab: function( instance, options )
	{
		options = options || {};

		var id = options.id || instance.uid || instance.id;
		var title = options.title || id;

		//check if the tab already exists
		var tab = this.graph_tabs.getTab( id );
		if(!tab)
			return false;

		var info = tab.graph_info;
		this.graph_tabs.removeTab( id );

		//open next tab or clear the codemirror editor content
		if(this.current_graph_info == info )
		{
			this.current_graph_info = null;
			this.graph = null;
			this.graphcanvas.setGraph( null );
			for(var i in this.graph_windows)
				this.graph_windows[i].graphcanvas.setGraph(null);
		}

		return true;
	},

	onNodeSelected: function(node)
	{
		this.selected_node = node;
		this.updateSidebar();
	},

	onClear: function()
	{
		this.editInstanceGraph(null);
		this.selected_node = null;
	},

	//save the state 
	onBeforeReload: function(e)
	{
		var state = { tabs: [] };

		//for every tab open
		for(var i in this.graph_tabs.tabs)
		{
			var tab = this.graph_tabs.tabs[i];
			//get the uid of the component
			var info = tab.graph_info;
			state.tabs.push( info );
		}
		this._saved_state = state;
	},

	//reload all the codes open
	onReload: function(e)
	{
		if(!this._saved_state)
			return;

		var state = this._saved_state;
		this.graph_tabs.removeAllTabs();

		for(var i in state.tabs)
		{
			var tab = state.tabs[i];
			var instance = LS.GlobalScene.findComponentByUId( tab.id );
			this.editInstanceGraph( instance, tab.options );
		}

		this._saved_state = null;
	},

	onNodeRemoved: function(evt, node)
	{
		//check if we are using one script in a tab
		if(!node)
			return;

		var components = node.getComponents();
		for(var i = 0; i < components.length; ++i)
		{
			var compo = components[i];
			//in case is open...
			this.closeInstanceTab( compo );
		}
	},

	onComponentRemoved: function(evt, compo )
	{
		this.closeInstanceTab( compo );
	},

	onUpdate: function(dt)
	{
		if(this._force_render)
		{
			this.graphcanvas.setDirty(true);
			//this.graphcanvas.draw();
		}
	},

	onKeyDown: function(e)
	{
		if(this.graphcanvas)
			this.graphcanvas.processKeyDown(e);
	},

	updateSidebar: function()
	{
		var inspector = this.inspector;

		inspector.clear();

		var global_graph = Scene.root.getComponent( GraphComponent );
		if(global_graph)
			inspector.addButton(null,"Edit global graph", {callback: this.onEditGlobalGraph.bind(this) });
		else
			inspector.addButton(null,"New global graph", {callback: this.onNewGlobalGraph.bind(this) });


		inspector.addButtons(null, ["Play Step","Render Frame"], { callback: function(v) { 
				if(v == "Play Step")
				{
					GraphModule.graph.runStep(1);
					GraphModule.graphcanvas.setDirty(true,true);
					if(GraphModule.selected_node)
						GraphModule.inspectNode(GraphModule.selected_node);
				}
				else //"Render Frame"
				{
					RenderModule.render(true);
				}
			}});
		inspector.addSeparator();
		inspector.addButton(null,"Open in Window", {callback: this.onOpenInWindow.bind(this) });

		if(this.selected_node)
			this.inspectNode(inspector, this.selected_node);
	},

	//inspect graph node properties
	inspectNode: function(inspector, node)
	{
		if(!node)
			return;

		inspector.addSection("Node");
		inspector.addString("Title", node.title, { callback: function(v) { node.title = v; }});
		inspector.addSeparator();

		var widgets_info = node.constructor.widgets_info || node.widgets_info;

		for(var i in node.properties)
		{
			//do we have info?
			if(widgets_info && widgets_info[i])
			{
				var options = widgets_info[i] || {};
				options = LS.cloneObject( options );
				options.field_name = i;
				options.callback = inner_assign;
				inspector.add(widgets_info[i].widget || widgets_info[i].type, i, node.properties[i], options);
			}
			else if(node.constructor["@" + i])
			{
				var options = node.constructor["@" + i] || {type:"number"};
				options = LS.cloneObject( options );
				options.field_name = i;
				options.callback = inner_assign;
				inspector.add( options.widget || options.type, options.title || i, node.properties[i], options );
			}
			else if(node.properties[i] !== null) //can we guess it from the current value?
			{
				if(typeof(node.properties[i]) == "boolean")
					inspector.addCheckbox(i, node.properties[i], { field_name: i, callback: inner_assign });
				else if(typeof(node.properties[i]) == "string")
					inspector.addString(i, node.properties[i], { field_name: i, callback: inner_assign });
				else if(typeof(node.properties[i]) == "number")
					inspector.addNumber(i, node.properties[i], { step: 0.01, field_name: i, callback: inner_assign });
				else if( node.properties[i].length == 3)
					inspector.addVector3(i, node.properties[i], { step: 0.01, field_name: i, callback: inner_assign });
				else if( node.properties[i].length == 2)
					inspector.addVector2(i, node.properties[i], { step: 0.01, field_name: i, callback: inner_assign });
			}
		}

		if(node.help)
			inspector.addInfo(null, node.help);

		inspector.addSeparator();

		inspector.addButtons(null, ["Collapse","Remove"], { callback: function(v) { 
			if(v == "Collapse")
				node.collapse();
			else if(v == "Remove")
				node.graph.remove(node);
		}});

		function inner_assign(v)
		{
			//safe way
			LS.setObjectProperty( node.properties, this.options.field_name, v );
		}
	},

	onOpenInWindow: function()
	{
		var external_window = window.open("","","width=500, height=500, location=no, status=no, menubar=no, titlebar=no");

		var canvas = external_window.document.createElement("canvas");
		canvas.width = canvas.height = 500;

		//CSS Stuff
		var link = external_window.document.createElement("link");
		link.rel="stylesheet"; link.type="text/css"; link.href = this.litegraph_css_url;
		external_window.document.head.appendChild(link);

		var style = external_window.document.createElement("style");
		style.innerHTML = "body { font-family: 'Arial'; background-color: #222; }\n * { margin: 0; padding: 0 };";
		external_window.document.head.appendChild(style);

		//Content
		external_window.document.body.appendChild(canvas);
		var window_graphcanvas = new LGraphCanvas(canvas, this.graph );
		window_graphcanvas.background_image = this.litegraph_path + "demo/imgs/grid.png";

		//Events
		external_window.addEventListener("resize",function(e)
		{
			window_graphcanvas.resize();
		});
		external_window.onbeforeunload = function(e)
		{
			window_graphcanvas.setGraph(null);
			GraphModule.graph_windows.splice( GraphModule.graph_windows.indexOf(this), 1 );
		};

		external_window.graphcanvas = window_graphcanvas;

		this.graph_windows.push( external_window );
	},

	onNewGlobalGraph: function()
	{
		var component = new GraphComponent();
		Scene.root.addComponent( component );
		this.editInstanceGraph( component, { id: component.uid, title: "Global" } );
	},

	onNewGraph: function( node )
	{
		node = node || SelectionModule.getSelectedNode();
		if(!node)
			node = LS.GlobalScene.root;
		var component = new GraphComponent();
		node.addComponent( component );
		this.editInstanceGraph( component, { id: component.uid, title: node.id } );
		this.openTab();
	},

	onEditGlobalGraph: function()
	{
		var global_graph = LS.GlobalScene.root.getComponent( GraphComponent );
		if(global_graph)
			this.editInstanceGraph( global_graph, { id: global_graph.uid, title: "Global" } );
	},

	render: function()
	{
		if( !this.graph || !EditorView.render_graph || RenderModule.render_options.in_player || !RenderModule.frame_updated )
			return;
		
		if(!this.view_canvas)
		{
			this.view_canvas = new LGraphCanvas( null, null, true );
			this.view_canvas.setCanvas( gl.canvas, true );
			this.view_canvas.onNodeSelected = function(node) { GraphModule.onNodeSelected(node); };
			this.view_canvas.pause_rendering = true;
			this.view_canvas.clear_background = false;
		}

		this.view_canvas.setGraph( this.graph, true );
		this.view_canvas.draw(true);
	},

	mousedown: function(e)
	{
		if(EditorView.render_graph && this.view_canvas)
		{
			this.view_canvas.processMouseDown( e );
			if(this.view_canvas.dirty_canvas)
				RenderModule.requestFrame();
			return true;
		}
	},

	mousemove: function(e)
	{
		if(EditorView.render_graph && this.view_canvas)
		{
			this.view_canvas.processMouseMove( e );
			if(this.view_canvas.dirty_canvas)
				RenderModule.requestFrame();
			return true;
		}
	},

	mousewheel: function(e)
	{
		if(EditorView.render_graph && this.view_canvas)
		{
			this.view_canvas.processMouseWheel( e );
			if(this.view_canvas.dirty_canvas)
				RenderModule.requestFrame();
			return true;
		}
	}

};

CORE.registerModule( GraphModule );

//UPDATE GRAPH

GraphModule.showGraphComponent = function(component, inspector)
{
	if(component.constructor == GraphComponent)
	{
		inspector.addCombo("on event", component.on_event, { values: GraphComponent["@on_event"].values , callback: function(v) { component.on_event = v; }});
		inspector.addCheckbox("Force redraw", component.force_redraw, { callback: function(v) { component.force_redraw = v; }});
	}
	else if(component.constructor == FXGraphComponent)
	{
		inspector.widgets_per_row = 2;
		inspector.addCheckbox("Viewport Size", component.use_viewport_size, { callback: function(v) { component.use_viewport_size = v; } });
		inspector.addCheckbox("Extra texture", component.use_extra_texture, { callback: function(v) { component.use_extra_texture = v; } });
		inspector.addCheckbox("High precisison", component.use_high_precision, { callback: function(v) { component.use_high_precision = v; } });
		inspector.addCheckbox("Antialiasing", component.use_antialiasing, { callback: function(v) { component.use_antialiasing = v; } });
		inspector.addCheckbox("Use node camera", component.use_node_camera, { callback: function(v) { component.use_node_camera = v; } });
		inspector.widgets_per_row = 1;
	}

	var nodes = component._graph.findNodesByType("scene/global");
	if(nodes.length)
	{
		//inspector.addTitle("Globals");
		for(var i = 0; i < nodes.length; ++i)
		{
			var n = nodes[i];
			var type = n.properties.type;

			inspector.add(type, n.properties.name, n.properties.value, { pretitle: AnimationModule.getKeyframeCode( component, n.properties.name ), min: n.properties.min, max: n.properties.max, step:0.01, node:n, callback: function(v) {
				this.options.node.properties.value = v;
			}});
		}
	}

	inspector.addButton(null,"Edit Graph", { callback: function() {
		GraphModule.openTab();
		GraphModule.editInstanceGraph( component, { id: component.uid, title: component._root.uid } );
	}});
}

GraphComponent["@inspector"] = GraphModule.showGraphComponent;
FXGraphComponent["@inspector"] = GraphModule.showGraphComponent;
