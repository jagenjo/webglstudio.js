var GraphModule = {
	name: "Graph",
	bigicon: "imgs/tabicon-graph.png",
	_force_render: false,

	current_graph_info: null,
	current_overgraph: null,

	is_sceneview_visible: true,
	show_panel: true,

	litegraph_path: "../../litegraph/",
	litegraph_css_url: "css/litegraph.css",
	graph_windows: [],

	init: function()
	{
		this.tab = LiteGUI.main_tabs.addTab( this.name, {id:"graphtab", bigicon: this.bigicon, size: "full",  module: GraphModule, callback: function(tab) {
			GraphModule.openTab();
			InterfaceModule.setSidePanelVisibility(true);
			GraphModule.show3DWindow( GraphModule.is_sceneview_visible );
			GraphModule._force_render = true;
			GraphModule.tabs_widget.onResize();
			//GraphModule.graphcanvas.pause_rendering = false;
		},
		callback_leave: function(tab) {
			//not visible
			GraphModule._force_render = false;
			RenderModule.appendViewportTo(null);
			//GraphModule.graphcanvas.pause_rendering = true;
		}});

		//Used to render the over graph
		RenderModule.canvas_manager.addWidget( this );

		//setup LiteGraph
		LiteGraph.node_images_path = this.litegraph_path + "/nodes_data/";
		LiteGUI.requireCSS([ this.litegraph_css_url ]);

		this.createInterface();
	},

	createInterface: function()
	{
		var that = this;

		this.root = LiteGUI.main_tabs.root.querySelector("#graphtab");

		var graph_area = this.graph_area = new LiteGUI.Area(null,{width: "100%"});
		this.root.appendChild( graph_area.root );
		graph_area.split("vertical",[null,"50%"],true);
		this.graph_3D_area = graph_area.getSection(0).content;

		LiteGUI.bind( graph_area, "split_moved", function(e){
			that.tabs_widget.onResize();
		});

		this.tabs_widget = new GenericTabsWidget();
		graph_area.getSection(1).add( this.tabs_widget );
		//this.root.appendChild( this.tabs_widget.root );
		this.tabs_widget.supported_widgets = [ GraphWidget ];

		LiteGUI.bind( this.tabs_widget, "tab_created", function(e){
			var tab = e.detail;
			var widget = tab.widget;
			var inspector = widget.top_widgets;
			
			inspector.addButton(null,"3D", { width: 50, callback: function(){
				GraphModule.show3DWindow(); //toggle
			}});

			inspector.addButton(null,"Side", { width: 80, callback: function(){
				GraphModule.showSidePanel();
			}});

		});

		this.tabs_widget.addWidgetTab( GraphWidget );
	},

	openTab: function()
	{
		LiteGUI.main_tabs.selectTab("Graph");
	},

	//shows the side 3d window
	show3DWindow: function(v)
	{
		if(v === undefined)
			v = !this.is_sceneview_visible;
		this.is_sceneview_visible = v;
		this.show_sceneview = v;

		if(v)
		{
			RenderModule.appendViewportTo( this.graph_area.sections[0].content );
			this.graph_area.showSection(0);
		}
		else
		{
			RenderModule.appendViewportTo(null);
			this.graph_area.hideSection(0);
		}
		this.tabs_widget.onResize();
	},

	showSidePanel: function(v)
	{
		InterfaceModule.setSidePanelVisibility(v);
		this.show_panel = InterfaceModule.side_panel_visibility;
		this.tabs_widget.onResize();
	},

	//switch coding tab
	editInstanceGraph: function( instance, options, open_tab )
	{
		options = options || {};

		if(open_tab)
			this.openTab();

		var found = this.tabs_widget.openInstanceTab( instance, options );
		if(!found)
		{
			//create and open
			var tab = this.tabs_widget.addWidgetTab( GraphWidget );
			tab.widget.editInstanceGraph( instance, options );
		}
	},

	closeInstanceTab: function( instance, options )
	{
		return this.tabs_widget.closeInstanceTab( instance, options );
	},

	onNewGraph: function( node )
	{
		node = node || SelectionModule.getSelectedNode();
		if(!node)
			node = LS.GlobalScene.root;
		var component = new LS.Components.GraphComponent();
		node.addComponent( component );
		UndoModule.saveComponentCreatedUndo( component );
		this.editInstanceGraph( component, { id: component.uid, title: node.id } );
		this.openTab();
	},

	render: function()
	{
		return;

		if( !EditorView.render_overgraph || !this.current_overgraph || RenderModule.render_settings.in_player || !RenderModule.frame_updated )
			return;

		if(!this.graph_canvas)
		{
			this.graph_canvas = new LGraphCanvas();
			this.graph_canvas.pause_rendering = true;
			this.graph_canvas.setCanvas( gl.canvas );
		}

		this.graph_canvas.setGraph( this.current_overgraph );
		this.graph_canvas.draw();
	}
};

CORE.registerModule( GraphModule );

//UPDATE GRAPH

GraphModule.showGraphComponent = function(component, inspector)
{
	if(component.constructor == LS.Components.GraphComponent)
	{
		inspector.addCombo("on event", component.on_event, { values: LS.Components.GraphComponent["@on_event"].values , callback: function(v) { component.on_event = v; }});
		inspector.addCheckbox("Force redraw", component.force_redraw, { callback: function(v) { component.force_redraw = v; }});
	}
	else if(component.constructor == LS.Components.FXGraphComponent)
	{

		inspector.addRenderFrameContext("Frame Settings", component.frame, { pretitle: AnimationModule.getKeyframeCode( component, "frame" ), callback: function(v) {} });
		inspector.widgets_per_row = 2;
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
				var graph_node = this.options.node;
				graph_node.properties.value = v;
				if(component.on_event == "render" || component.on_event == "update")
					component._graph.runStep(1);
				LS.GlobalScene.refresh();
			}});
		}
	}

	inspector.addButton(null,"Edit Graph", { callback: function() {
		GraphModule.openTab();
		GraphModule.editInstanceGraph( component, { id: component.uid, title: component._root.uid } );
	}});
}

LS.Components.GraphComponent["@inspector"] = GraphModule.showGraphComponent;
LS.Components.FXGraphComponent["@inspector"] = GraphModule.showGraphComponent;
