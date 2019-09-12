var VolumeTool = {
	name: "volume",
	description: "Select a volume",
	section: "",
	icon: "imgs/mini-icon-cube.png",

	state: "",
	volume: false,
	start: vec3.create(),
	end: vec3.create(),
	selection_bbox: BBox.create(),

	renderEditor: function(camera, not_selected )
	{
		if(!this.volume) 
			return;

		//now render the line
		gl.disable(gl.DEPTH_TEST);
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
		LS.Draw.setColor( not_selected ? [0.5,0.5,0.5,1] : [1,0,1,1] );

		var sizex = this.end[0] - this.start[0];
		var sizey = this.end[1] - this.start[1];
		var sizez = this.end[2] - this.start[2];

		var centerx = this.start[0] + sizex * 0.5;
		var centery = this.start[1] + sizey * 0.5;
		var centerz = this.start[2] + sizez * 0.5;

		LS.Draw.push();
		LS.Draw.translate( centerx, centery, centerz );
		LS.Draw.renderWireBox( sizex, sizey, sizez );
		LS.Draw.pop();

		gl.enable(gl.DEPTH_TEST);
	},

	renderEditorAlways: function( camera )
	{
		this.renderEditor( camera, true );
	},

	mousedown: function(e)
	{
		if (e.which != GL.LEFT_MOUSE_BUTTON)
			return;

		var camera = RenderModule.getActiveCamera();
		var ray = camera.getRayInPixel( e.canvasx, e.canvasy );
		var point = vec3.create();

		if(!this.state)
		{
			var plane_center = [0,0,0];
			var plane_normal = [0,1,0];
			if( geo.testRayPlane( ray.origin, ray.direction, plane_center, plane_normal, point ) )
			{
				this.start.set( point );		
				this.volume = true;
				this.state = "dragging_base";
			}
		}
		else if(this.state == "dragging_height")
		{
			this.state = "";
			var sizex = this.end[0] - this.start[0];
			var sizey = this.end[1] - this.start[1];
			var sizez = this.end[2] - this.start[2];
			var centerx = this.start[0] + sizex * 0.5;
			var centery = this.start[1] + sizey * 0.5;
			var centerz = this.start[2] + sizez * 0.5;

			BBox.setCenterHalfsize( this.selection_bbox, [centerx, centery,centerz] , [Math.abs(sizex*0.5), Math.abs(sizey*0.5), Math.abs(sizez*0.5)] );
			SelectionModule.selection_volume = this.selection_bbox;
		}

		return true;
	},

	mouseup: function(e)
	{
		this.volume = true;
		if(this.state == "dragging_base")
		{
			if(e.click_time < 200) //cancel
			{
				this.state = "";
				this.volume = false;
				SelectionModule.selection_volume = null;
				LS.GlobalScene.refresh();
			}
			else
				this.state = "dragging_height";
		}
		else
			this.state = "";
		return true;
	},

	mousemove: function(e)
	{
		if(!this.state)
			return;

		var camera = RenderModule.getActiveCamera();
		var ray = camera.getRayInPixel( e.canvasx, e.canvasy );
		var point = vec3.create();

		if(this.state == "dragging_base")
		{
			var plane_center = [0,0,0];
			var plane_normal = [0,1,0];
			if( geo.testRayPlane( ray.origin, ray.direction, plane_center, plane_normal, point ) )
				this.end.set( point );		
		}
		else if(this.state == "dragging_height")
		{
			var plane_center = this.end;
			var plane_normal = camera.getFront();
			if( geo.testRayPlane( ray.origin, ray.direction, plane_center, plane_normal, point ) )
				this.end[1] = point[1];
		}

		LS.GlobalScene.refresh();
		return true;
	}
};

ToolsModule.registerTool( VolumeTool );

