var ShadersModule = {

	enabled: false,
	name: "Shaders",
	bigicon: "imgs/tabicon-shaders.png",

	icons: {
	},

	preferences: { //persistent settings
	},

	init: function()
	{
		//Register in CanvasManager to render the border on playmode
		//RenderModule.canvas_manager.addWidget( PlayModule, 10 );

		this.tab = LiteGUI.main_tabs.addTab("Shaders", {id:"shaderstab", bigicon: this.bigicon, size: "full", module: EditorModule, callback: function() {
			//get the canvas
			ShadersModule.enabled = true;
			RenderModule.canvas_manager.addWidget( ShadersModule );
			var canvas = RenderModule.appendViewportTo( ShadersModule.area.content );
		},
		callback_leave: function() {
			ShadersModule.enabled = false;
			RenderModule.appendViewportTo(null);
			RenderModule.canvas_manager.removeWidget( ShadersModule );
		}});

		this.root = this.tab.content;

		//top bar
		var top_widgets = this.top_widgets = new LiteGUI.Inspector( { one_line: true });
		top_widgets.addButton(null,"New", { callback: this.onNewGraph.bind(this), width: 50 });
		top_widgets.addButton(null,"Open", this.onOpenGraph.bind(this) );
		top_widgets.root.style.borderTop = "1px solid #222";
		this.root.appendChild( top_widgets.root );

		//create area
		var area = this.area = new LiteGUI.Area( { className: "shaderarea", height: -30});
		this.root.appendChild( area.root );
	},

	onNewGraph: function()
	{
		//Create Material

		//Request Graph
	},

	onOpenGraph: function()
	{
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

		gl.restore();
		gl.finish2D(); //WebGLtoCanvas2D
		return true;
	}
};

CORE.registerModule( ShadersModule );