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

		//Register in CanvasManager to render the border on playmode
		//RenderModule.canvas_manager.addWidget( PlayModule, 10 );

		this.tab = LiteGUI.main_tabs.addTab("Shaders", {id:"shaderstab", bigicon: this.bigicon, size: "full", module: this, callback: function() {
			//get the canvas
			ShadersModule.enabled = true;
			RenderModule.canvas_manager.addWidget( ShadersModule );
			var canvas = RenderModule.appendViewportTo( ShadersModule.area.content );
			ShadersModule.graphcanvas.setCanvas( canvas, true );
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
		this.root.appendChild( area.root );

		//graphs
		this.graph = null;
		this.graphcanvas = new LiteGraph.LGraphCanvas(null,null,{ skip_render: true });
		this.graphcanvas.onShowNodePanel = this.onShowNodePanel.bind(this);
		this.graphcanvas.onRenderBackground = this.onRenderCanvasBackground.bind(this);
		this.graphcanvas.filter = "shader";
	},

	openTab: function()
	{
		LiteGUI.main_tabs.selectTab( ShadersModule.tab_name );
	},

	editGraph: function( material, options )
	{
		var graphcode = material.graphcode;
		if(!graphcode)
			return;
		this.graph = graphcode.graph;
		this.graphcanvas.setGraph( this.graph );
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
		EditorModule.checkCode( graphcode.getShaderCode( true ) );
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