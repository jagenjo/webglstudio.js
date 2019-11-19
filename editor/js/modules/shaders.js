var ShadersModule = {

	name: "Shaders",
	enabled: false,
	tab_name: "Shaders",
	bigicon: "imgs/tabicon-shaders.png",

	icons: {
	},

	preferences: { //persistent settings
		overlay_graph: false
	},

	init: function()
	{
		if( !LS.GraphMaterial )
			return;

		LiteGUI.Inspector.widget_constructors["float"] = "addNumber";

		//Register in CanvasManager to render the border on playmode
		//RenderModule.canvas_manager.addWidget( PlayModule, 10 );

		LiteGUI.addCSS("	.shader-prop { cursor: pointer; }\n\
			.shader-prop .winfo { margin: 4px; padding: 4px; padding-left: 10px; background: #4d223f; 2px 2px 2px black; border-radius: 8px; overflow: hidden; }\n\
			.shader-prop .winfo:hover { background: #444; 2px 2px 2px black; }\n\
			.shader-prop .winfo .type { padding: 0 10px; opacity: 0.5; font-size: 0.95em; width: 80px; display: inline-block; }\n\
			.shader-prop .winfo .name { font-size: 1.2em; color: white; }\n\
		");

		this.tab = LiteGUI.main_tabs.addTab("Shaders", {id:"shaderstab", bigicon: this.bigicon, size: "full", module: this, callback: function() {
			//get the canvas
			ShadersModule.enabled = true;
			RenderModule.canvas_manager.addWidget( ShadersModule );
			var canvas = RenderModule.appendViewportTo( ShadersModule._canvas_area );
			ShadersModule.graphcanvas.setCanvas( canvas, true );
			canvas.height = canvas.parentNode.offsetHeight;
		},
		callback_leave: function() {
			ShadersModule.graphcanvas.setCanvas( null, true );
			ShadersModule.enabled = false;
			RenderModule.appendViewportTo(null);
			RenderModule.canvas_manager.removeWidget( ShadersModule );
		}});

		this.root = this.tab.content;

		//top bar
		var top_widgets = this.top_widgets = new LiteGUI.Inspector( { one_line: true });
		top_widgets.addButton(null,"New", { callback: this.onNewGraph.bind(this), width: 50 });
		top_widgets.addButton(null,"Open", this.onOpenGraph.bind(this) );
		top_widgets.addButton(null,"Save", this.saveGraph.bind(this) );
		top_widgets.addButton(null,"Compile", this.compileGraph.bind(this) );
		top_widgets.addButton(null,"GLSL", this.showCode.bind(this) );
		top_widgets.addCheckbox("Overlay", ShadersModule.preferences.overlay_graph, function(v){ ShadersModule.preferences.overlay_graph = v; } );
		top_widgets.root.style.borderTop = "1px solid #222";
		this.root.appendChild( top_widgets.root );

		//create area
		var area = this.area = new LiteGUI.Area( { className: "shaderarea", height: -30});
		area.root.style.position = "relative";
		area.root.style.overflow = "hidden";
		this.root.appendChild( area.root );

		//canvas area
		var canvas_area = this._canvas_area = LiteGUI.createElement("div",".shader_canvas_area");
		canvas_area.style.height = "100%";
		area.add( canvas_area );

		//graphs
		this.graph = null;
		this.graphcanvas = new LiteGraph.LGraphCanvas(null,null,{ skip_render: true });
		this.graphcanvas.onShowNodePanel = this.onShowNodePanel.bind(this);
		this.graphcanvas.onRenderBackground = this.onRenderCanvasBackground.bind(this);
		//this.graphcanvas.onDropItem = this.onDropItem.bind(this); //does not apply as this uses another canvas
		this.graphcanvas.filter = "shader";
		this.graphcanvas.ds.offset[0] = 280; //offset a little bit to avoid overlaping with the sidebar

		//toolset
		var sidebar = new LiteGUI.Panel({width: 256, height: "calc( 100% - 256px )", position: [0,0] }); 
		sidebar.root.style.background = "#1A1A1A";
		area.add(sidebar);

		var sidebar_inspector = this.sidebar_inspector = new LiteGUI.Inspector( { className: "dark" });
		sidebar.add( sidebar_inspector );
		this.updateSidebar();
	},

	updateSidebar: function()
	{
		var sidebar_inspector = this.sidebar_inspector;
		sidebar_inspector.clear();

		sidebar_inspector.addTitle("Properties",{ collapsable: true });

		var material = this.material;
		if(material && material.graphcode)
		{
			var properties = material.graphcode.properties;
			for(var i in properties)
			{
				var p = properties[i];
				//sidebar_inspector.addString( p.type, p.name, { pretitle: ShadersModule.getBulletCode( material, p.name ), disabled:true });
				var pelem = sidebar_inspector.addInfo(null,"<span class='bullet_icon'></span><span class='type'></span><span class='name'></span>");
				pelem.dataset["propname"] = p.name;
				pelem.classList.add("shader-prop");
				pelem.querySelector(".type").innerText = p.type;
				pelem.querySelector(".name").innerText = p.name;
			}
		}

		sidebar_inspector.addSeparator();

		sidebar_inspector.addButton(null,"Edit Properties",function(v){
			var material = ShadersModule.material;
			if(!material || !material.graphcode)
				return;
			EditorModule.showEditPropertiesDialog( material.graphcode.properties, LS.GraphMaterial.valid_properties, function(prop){
				console.log(prop);	
				ShadersModule.updateSidebar();
			});
		});

		/*
		sidebar_inspector.addSection("Nodes");
		this.nodes_container = sidebar_inspector.addContainer(".nodes_available",{ height: 200 });
		this.nodes_container.style.backgroundColor = "#111";
		*/

		InterfaceModule.attachBulletsBehaviour( sidebar_inspector, ".shader-prop", inner_onBulletClick, inner_onBulletRightClick, inner_onBulletDragStart );

		function inner_onBulletClick(e)
		{
			console.log("create node?");
		}

		function inner_onBulletRightClick(e)
		{
			console.log("show property menu?");
		}

		function inner_onBulletDragStart(e)
		{
			e.dataTransfer.setData("nodetype","shader/uniform");
			e.dataTransfer.setData("propname","name");
			var name = e.target.dataset["propname"];
			e.dataTransfer.setData("propvalue", name );
		}
	},

	getBulletCode: function( target, property, options )
	{
		if(!target.getLocator)
			return "";
		var locator = target.getLocator();
		if(!locator)
			return "";

		var prefab = LS.checkLocatorBelongsToPrefab( locator );
		if( prefab )
			locator = LS.convertLocatorFromUIDsToName( locator );

		return "<span title='Drag property for "+property+"' class='bullet_icon' data-propertyname='" + property + "' data-propname='"+property+"' data-propertyuid='" + locator + "/" + property + "' ></span>";
	},

	//called from Core when droping into the WebGLCanvas
	onItemDrop: function(e)
	{
		e.preventDefault();
		e.stopPropagation();
		e.stopImmediatePropagation();

		var graph = this.graph;
		if(!graph)
			return;

		var nodetype = e.dataTransfer.getData("nodetype");
		var graphnode = LiteGraph.createNode( nodetype );
		if(!graphnode)
		{
			console.log("unknown node type:", nodetype );
			return;
		}

		var prop_name = e.dataTransfer.getData("propname");
		var prop_value = e.dataTransfer.getData("propvalue");
		if(prop_name)
			graphnode.setProperty(prop_name, prop_value);

		var s = Math.floor(LiteGraph.NODE_TITLE_HEIGHT * 0.5);
		this.graphcanvas.adjustMouseEvent(e);
		graphnode.pos[0] = e.canvasX - s;
		graphnode.pos[1] = e.canvasY + s;

		//get active graph
		graph.add( graphnode );

		return true;
	},

	openTab: function()
	{
		LiteGUI.main_tabs.selectTab( ShadersModule.tab_name );
	},

	editGraph: function( material, options )
	{
		this.material = material;
		var graphcode = material.graphcode;
		if(!graphcode)
			return;
		this.graph = graphcode.graph;
		this.graphcanvas.setGraph( this.graph );
		this.graphcanvas._material = material;

		this.updateSidebar();

		window.SHADERGRAPH = this.graph;
	},

	onNewGraph: function()
	{
		//Create Material

		//Request Graph
	},

	onOpenGraph: function()
	{
	},

	saveGraph: function()
	{
		//store changes in GraphCode
		if(!this.graph)
			return;
		var graphcode = this.graph._graphcode;
		if(!graphcode)
			return;
		LS.RM.resourceModified( graphcode );
		DriveModule.saveResource( graphcode );
	},

	compileGraph: function()
	{
		//store changes in GraphCode
		if(!this.graph)
			return;
		var graphcode = this.graph._graphcode;
		if(!graphcode)
			return;
		graphcode.graph._version++;
		LS.RM.resourceModified( graphcode );

	},	

	showCode: function()
	{
		if(!this.graph)
			return;
		var graphcode = this.graph._graphcode;
		if(!graphcode)
			return;
		EditorModule.checkCode( graphcode.getShaderCode( true ), "Shader Code" );
	},

	onShowNodePanel: function( node )
	{
		var inspector = this.inspector || EditorModule.inspector;
		inspector.inspect( node );
		this.inspected_node = node;
	},

	onRenderCanvasBackground: function()
	{
		if(!this.preferences.overlay_graph)
			return false;

		gl.finish2D(); //WebGLtoCanvas2D
		this.renderPreview( true );
		gl.start2D(); //WebGLtoCanvas2D

		return true;
	},

	render: function()
	{

		if(!this.enabled) 
			return;

		gl.clearColor(0.02,0.02,0.02,1.0);
		gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT );

		var ctx = gl; //nicer

		ctx.start2D(); //WebGLtoCanvas2D
		ctx.save();

		ctx.fillStyle = "#333";
		ctx.font = "40px Arial";
		ctx.fillText( "Shaders", 20, 40 );

		if(this.graph)
			this.graphcanvas.draw();

		gl.restore();
		gl.finish2D(); //WebGLtoCanvas2D

		if(!this.preferences.overlay_graph)
			this.renderPreview();

		return true;
	},

	renderPreview: function( fullscreen )
	{
		gl.clear( gl.DEPTH_BUFFER_BIT );

		if(fullscreen)
		{
			var camera = RenderModule.getActiveCamera();
			LS.Renderer.renderFrame( camera, RenderModule.render_settings, LS.GlobalScene );		
			return;
		}

		gl.viewport(0,0,256,256);
		LS.Renderer.setFullViewport(0,0,256,256);
		var temp = RenderModule.render_settings.keep_viewport;
		RenderModule.render_settings.keep_viewport = true;
		var camera = RenderModule.getActiveCamera();
		LS.Renderer.renderFrame( camera, RenderModule.render_settings, LS.GlobalScene );		
		LS.Renderer.setFullViewport(0,0,gl.canvas.width,gl.canvas.height);
		gl.viewport(0,0,gl.canvas.width,gl.canvas.height);
		RenderModule.render_settings.keep_viewport = temp;
	},

	mousedown: function(e)
	{
		/*
		if(	(getTime() - this._last_mouseup) < 200 && this.selected_item ) //dblclick
			EditorModule.inspect( this.selected_item.item );
		else
		*/
		this.graphcanvas.processMouseDown(e);

		return true;
	},

	mouseup: function(e)
	{
		/*
		if(e.click_time < 200)
		{
			this.selected_item = this.getItemAtPos(e.mousex, e.mousey);
			this._last_mouseup = getTime(); //for dblclick
		}
		*/

		this.graphcanvas.processMouseUp(e);
		return true;
	},

	mousemove: function(e)
	{
		this.graphcanvas.processMouseMove(e);
		return true;
	},
		
	mousewheel: function(e)
	{
		if(!this.enabled)
			return;
		this.graphcanvas.processMouseWheel(e);
		return true;
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
		{
			this.graphcanvas.processKey(e);
			return;
		}

		e.preventDefault();
		e.stopPropagation();
		return true;
	},


};

CORE.registerModule( ShadersModule );


