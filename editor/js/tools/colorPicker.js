var colorPickerTool = {
	name: "colorPicker",
	description: "Select color",
	section: "foo",
	icon: "imgs/mini-icon-colorpicker.png",

	callback: null,

	show_realtime: false,

	last_mouse: vec2.create(),
	last_color: vec3.fromValues(0,1,0),

	renderEditor: function() {
		if(!this.show_realtime)
			return;
		gl.start2D();
		gl.fillColor = this.last_color;
		gl.fillRect( this.last_mouse[0] - 20, gl.canvas.height - this.last_mouse[1] - 5, 10,10 );
		gl.finish2D();
	},

	getColorFromMouse: function(e, skip_redraw)
	{
		RenderModule.render(!skip_redraw); //force repaint so there is something in the buffer
		var image_data = gl.getImageData( e.canvasx, e.canvasy, 1, 1 );
		var color_bytes = image_data.data.subarray(0,3);
		this.last_color.set( [color_bytes[0]/255, color_bytes[1]/255, color_bytes[2]/255] );
		return vec3.clone( this.last_color );
	},

	mousedown: function(e)
	{
		if (e.which != GL.LEFT_MOUSE_BUTTON)
			return;

		var color = this.getColorFromMouse(e);

		if(this.callback)
		{
			this.callback( color );
			this.callback = null;

			if(this._old_tool)
				ToolsModule.enableTool( this._old_tool.name );
			else
				ToolsModule.enableTool("manipulate");
			this._old_tool = null;
			gl.canvas.style.cursor = "";
		}
		else
			console.log( "Color", color );

		return true;
	},

	mouseup: function(e)
	{
		return true;
	},

	mousemove: function(e)
	{
		this.last_mouse[0] = e.canvasx;
		this.last_mouse[1] = e.canvasy;
		gl.canvas.style.cursor = "crosshair";
		if(this.show_realtime)
		{
			RenderModule.requestFrame();
			this.getColorFromMouse(e);
		}
		return true;
	},

	oneClick: function( callback )
	{
		if(ToolsModule.current_tool != this)
			this._old_tool = ToolsModule.current_tool;

		ToolsModule.enableTool(this.name);
		this.callback = callback;
	}
};

ToolsModule.registerTool( colorPickerTool );

