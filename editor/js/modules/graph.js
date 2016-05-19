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
			InterfaceModule.setSidePanelVisibility(true);
			GraphModule._force_render = true;
			//GraphModule.graphcanvas.pause_rendering = false;
		},
		callback_leave: function(tab) {
			//not visible
			GraphModule._force_render = false;
			//GraphModule.graphcanvas.pause_rendering = true;
		}});

		RenderModule.canvas_manager.addWidget( this );

		LiteGraph.node_images_path = this.litegraph_path + "/nodes_data/";

		this.root = LiteGUI.main_tabs.root.querySelector("#graphtab");

		this.buildGUI();
		LiteGUI.requireCSS([ this.litegraph_css_url ]);

		//events that affect graphs
		/*
		LEvent.bind( LS.GlobalScene, "update", function(e,dt) { GraphModule.onUpdate(dt); });
		LEvent.bind( LS.GlobalScene, "clear", this.onClear.bind(this) );
		LEvent.bind( LS.GlobalScene, "beforeReload", this.onBeforeReload.bind(this) );
		LEvent.bind( LS.GlobalScene, "reload", this.onReload.bind() );
		LEvent.bind( LS.GlobalScene, "nodeRemoved", this.onNodeRemoved.bind(this) );
		LEvent.bind( LS.GlobalScene, "nodeComponentRemoved", this.onComponentRemoved.bind(this) );
		*/
	},

	buildGUI: function()
	{
		this.tabs_widget = new GenericTabsWidget();
		this.root.appendChild( this.tabs_widget.root );
		this.tabs_widget.supported_widgets = [ GraphWidget ];
		this.tabs_widget.addWidgetTab( GraphWidget );
	},

	openTab: function()
	{
		LiteGUI.main_tabs.selectTab("Graph");
		//var rect = this.canvas.parentNode.getClientRects()[0];
		//this.graphcanvas.resize( rect.width, rect.height - 20 );
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
		this.editInstanceGraph( component, { id: component.uid, title: node.id } );
		this.openTab();
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
				if(component.on_event == "render")
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
