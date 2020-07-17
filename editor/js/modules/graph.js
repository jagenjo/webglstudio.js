var GraphModule = {
	name: "Graph",
	tab_name: "Graph",

	bigicon: "imgs/tabicon-graph.png",
	_force_render: false,

	current_graph_info: null,
	current_overgraph: null,
	_link_texture: null,

	is_sceneview_visible: true,
	show_panel: true,

	litegraph_path: "../../litegraph/",
	litegraph_css_url: "css/litegraph.css",
	graph_windows: [],

	init: function()
	{
		this.tab = LiteGUI.main_tabs.addTab( this.tab_name, {id:"graphtab", bigicon: this.bigicon, size: "full",  module: GraphModule, callback: function(tab) {
			//GraphModule.openTab();
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
		InterfaceModule.lower_tabs_widget.addWidgetTab( GraphWidget );

		//setup LiteGraph
		LiteGraph.node_images_path = this.litegraph_path + "/nodes_data/";
		LiteGUI.requireCSS([ this.litegraph_css_url ]);

		this.createInterface();
	},

	createInterface: function()
	{
		var that = this;

		this.root = LiteGUI.main_tabs.root.querySelector("#graphtab");

		var graph_area = this.graph_area = new LiteGUI.Area({ width: "100%" });
		this.root.appendChild( graph_area.root );
		graph_area.split("vertical",[null,"50%"],true);
		this.graph_3D_area = graph_area.getSection(0).content;
		this.graph_3D_area.style.backgroundColor = "black";

		LiteGUI.bind( graph_area, "split_moved", function(e){
			that.tabs_widget.onResize();
		});

		this.tabs_widget = new GenericTabsWidget();
		graph_area.getSection(1).add( this.tabs_widget );
		this.tabs_widget.supported_widgets = [ GraphWidget ];

		LiteGUI.bind( this.tabs_widget, "tab_created", function(e){
			var tab = e.detail;
			var widget = tab.widget;
			var inspector = widget.top_widgets;

			inspector.addButton(null,"3D", { width: 50, callback: function(){
				GraphModule.show3DWindow(); //toggle
			}});

			inspector.addButton(null,"Preview", { width: 100, callback: function(){
				GraphModule.showPreviewSelection();
			}});

			inspector.addButton(null,"Side", { width: 80, callback: function(){
				GraphModule.showSidePanel();
			}});
		});

		this.tabs_widget.addWidgetTab( GraphWidget );
	},

	openTab: function()
	{
		LiteGUI.main_tabs.selectTab( GraphModule.tab_name );
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

	onNewGraph: function( node, from_file )
	{
		node = node || SelectionModule.getSelectedNode();
		if(!node)
			node = LS.GlobalScene.root;

		var component = new LS.Components.GraphComponent();
		component.from_file = from_file;
		node.addComponent( component );
		CORE.userAction("component_created", component );

		if( from_file )
		{
		}
		else
		{
			this.editInstanceGraph( component, { id: component.uid, title: node.id } );
			this.openTab();
		}
	},

	onNewGraphCode: function( fullpath )
	{
		var graphcode = new LS.GraphCode();
		graphcode.fullpath = fullpath;
		graphcode.filename = filename;

		//this.editInstanceGraph( graphcode, { id: fullpath, title: LS.RM.getFilename( fullpath ) } );
		this.openTab();
	},

	render: function()
	{
		if( !EditorView.render_helpers || RenderModule.render_settings.in_player || !RenderModule.frame_updated )
			return;

		if(!this._link_texture || !GraphModule._force_render)
			return;

		var w = gl.canvas.width;
		var h = gl.canvas.height;
		gl.drawImage( this._link_texture, 50, gl.canvas.height, w, h );
		return;
	},

	onKeyDown: function(e)
	{
		//console.log("key",e);
		if( e.code == "KeyS" && e.ctrlKey )
			this.saveGraph();
		else if( e.code == "F6" )
			EditorModule.reloadEditor(true);
		else if( e.code == "Enter" && e.ctrlKey )
			this.compileGraph();
		else
			return;

		e.preventDefault();
		e.stopPropagation();
		return true;
	},

	saveGraph: function()
	{
		//store changes in GraphCode
		var graph_widget = this.tabs_widget.getCurrentWidget();
		if(graph_widget)
			graph_widget.saveGraph();
	},

	compileGraph: function()
	{
		//store changes in GraphCode
		var graph_widget = this.tabs_widget.getCurrentWidget();
		if(graph_widget)
			graph_widget.compileGraph();
	},

	showPreviewSelection: function()
	{
		if(!this._texture_preview)
		{
			this._texture_preview = new TexturePreviewWidget();
			RenderModule.canvas_manager.root.addChild(this._texture_preview);
			this._texture_preview.onClose = function()
			{
				GraphModule._texture_preview = null;
			}
		}
		else
		{
			RenderModule.canvas_manager.root.removeChild(this._texture_preview);
			this._texture_preview = null;
		}
	}
};

CORE.registerModule( GraphModule );

//UPDATE GRAPH

GraphModule.showGraphComponent = function( component, inspector )
{
	if(component.from_file)
		inspector.addGraph("filename", component.filename, { name_width: 60, callback: function(v) { component.filename = v; }});

	if(component.constructor == LS.Components.GraphComponent)
	{
		inspector.widgets_per_row = 3;
		inspector.addCombo("on event", component.on_event, { name_width: 60, width:"calc( 100% - 110px )", values: LS.Components.GraphComponent["@on_event"].values , callback: function(v) { component.on_event = v; }});
		inspector.addCheckbox("redraw", component.force_redraw, { width:80, callback: function(v) { component.force_redraw = v; }});
		inspector.addButton(null,LiteGUI.special_codes.navicon, { width: 30, callback: function(v,event) {
			var graph = component.graph;
			var options = graph._nodes;
			var menu = new LiteGUI.ContextMenu( options, { ignore_item_callbacks: true, event: event, title: "Nodes", autoopen: false, callback: function( v, o, e ) {
				EditorModule.inspect(v);
			}});
		}});
		inspector.widgets_per_row = 1;
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
			var widget_type = n.properties.widget || n.properties.type;

			inspector.add( widget_type, n.properties.name, n.properties.value, { pretitle: AnimationModule.getKeyframeCode( component, n.properties.name ), min: n.properties.min, max: n.properties.max, step:0.01, node:n, callback: function(v) {
				var graph_node = this.options.node;
				graph_node.properties.value = v;
				if(component.on_event == "render" || component.on_event == "update")
					component._graph.runStep(1);
				LS.GlobalScene.refresh();
			}});
		}
	}

	inspector.widgets_per_row = 1;
	inspector.addButton(null,"Edit Graph", { callback: function() {
		GraphModule.openTab();
		GraphModule.editInstanceGraph( component, { id: component.uid, title: component._root.uid } );
	}});

	inspector.widgets_per_row = 1;
}

LS.Components.GraphComponent["@inspector"] = GraphModule.showGraphComponent;
LS.Components.FXGraphComponent["@inspector"] = GraphModule.showGraphComponent;

if(!LS.Components.GraphComponent.actions)
	LS.Components.GraphComponent.actions = {}
if(!LS.Components.FXGraphComponent.actions)
	LS.Components.FXGraphComponent.actions = {}

LS.Components.GraphComponent.actions["set_title"] = LS.Components.FXGraphComponent.actions["set_title"] = { 
	title: "Set Title",
	callback: function(){
		var that = this;
		LiteGUI.prompt("Set a title for the Graph", function(v){
			if(v)
				that.title = v;
			else if (v == "")
				that.title = null;
		});
	}
};


LS.Components.GraphComponent.actions["show_graph_json"] = LS.Components.FXGraphComponent.actions["show_graph_json"] = { 
	title: "Show Graph JSON",
	callback: function(){
		EditorModule.checkJSON( this._graph );
	}
};

LS.Components.GraphComponent.actions["to_inner"] = { 
	title: "Convert to Inner Graph",
	callback: function(){
		this.from_file = false;
	}
};

LS.Components.GraphComponent.actions["to_file"] = { 
	title: "Convert to Graph From File",
	callback: function(){
		this.from_file = true;
	}
};

