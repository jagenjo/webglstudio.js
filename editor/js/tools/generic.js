//************** BASE TOOLS *******************************


//******* BUTTONS ******************************

var worldSpaceButton = {
	name: "world-space",
	description: "Change to world space mode",
	section: "coords",
	combo: true,
	icon: "imgs/mini-icon-world-coords.png",
	callback: function()
	{
		ToolsModule.coordinates_system = 'world';
	}
};

ToolsModule.registerButton( worldSpaceButton );

var objectSpaceButton = {
	name: "object-space",
	description: "Change to object space mode",
	section: "coords",
	enabled: true,
	combo: true,
	icon: "imgs/mini-icon-local-coords.png",
	callback: function()
	{
		ToolsModule.coordinates_system = 'object';
	}
};

ToolsModule.registerButton( objectSpaceButton );


var fxEnabledButton = {
	name: "fx",
	description: "Show Postprocessing fx in editor",
	section: "visibility",
	icon: "imgs/mini-icon-fx.png",
	enabled: true,
	callback: function()
	{
		RenderModule.render_settings.render_fx = !RenderModule.render_settings.render_fx;
	}
};

ToolsModule.registerButton( fxEnabledButton );

var lightsEnabledButton = {
	name: "lights",
	description: "Show lights in editor",
	section: "visibility",
	icon: "imgs/mini-icon-light.png",
	enabled: true,
	callback: function()
	{
		RenderModule.render_settings.lights_disabled = !RenderModule.render_settings.lights_disabled;
	}
};

ToolsModule.registerButton( lightsEnabledButton );

var showGraphButton = {
	name: "graph",
	description: "Overlap Graph",
	section: "visibility",
	icon: "imgs/mini-icon-graph.png",
	enabled: false,
	callback: function()
	{
		EditorView.render_graph = !EditorView.render_graph;
	}
};

ToolsModule.registerButton( showGraphButton );

var helpersEnabledButton = {
	name: "helpers",
	description: "Show helpers in editor",
	section: "visibility",
	icon: "imgs/mini-icon-grid.png",
	enabled: true,
	callback: function()
	{
		EditorView.render_helpers = !EditorView.render_helpers;
	}
};

ToolsModule.registerButton( helpersEnabledButton );

var autorenderEnabledButton = {
	name: "autorender",
	description: "Force to render all frames",
	section: "visibility",
	icon: "imgs/mini-icon-rotator.png",
	enabled: false,
	callback: function()
	{
		RenderModule.auto_render = !RenderModule.auto_render;
	}
};

ToolsModule.registerButton( autorenderEnabledButton );


var centerInObjectButton = {
	name: "center-in-object",
	description: "Center in selected object",
	section: "node-actions",
	icon: "imgs/mini-icon-center.png",
	callback: function()
	{
		EditorModule.centerCameraInSelection();
		return false;
	}
};

ToolsModule.registerButton(centerInObjectButton);



var TestCollisionsTool = {
	name: "testCollisions",
	description: "To test collisions",
	section: "select",
	icon: "imgs/mini-icon-test.png",

	enabled: false,

	points: null,
	click_pos: vec2.create(),

	onEnable: function()
	{
	},

	onClick: function()
	{
		if(this.points)
			this.points.length = 0;
	},

	mousedown: function(e) {
		this.click_pos[0] = e.canvasx;
		this.click_pos[1] = e.canvasy;
	},

	mousemove: function(e) {
		//return;
		
		//test
		if(e.dragging && e.which == GL.LEFT_MOUSE_BUTTON && !e.ctrlKey)
		{
			var camera = ToolUtils.getCamera();
			var ray = camera.getRayInPixel( e.canvasx, e.canvasy );
			//ray.end = vec3.add( vec3.create(), ray.start, vec3.scale(vec3.create(), ray.direction, 10000) );
			var collisions = LS.Physics.raycast( ray.start, ray.direction ); //max_dist, layers, scene

			if(collisions.length)
			{
				if(!this.points)
					this.points = [];
				this.points.push( collisions[0].position );
			}
			LS.GlobalScene.refresh();
			return true;
		}
	},

	mouseup: function(e) {
	},

	renderEditor: function(camera)
	{
		if(!EditorView.mustRenderGizmos()) 
			return;
		if(!RenderModule.frame_updated) 
			return;

		if(!this.points || !this.points.length)
			return;

		//now render the line
		//gl.disable(gl.DEPTH_TEST);
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
		LS.Draw.setColor([1,0,1,1]);

		LS.Draw.renderPoints( this.points );

		gl.enable(gl.DEPTH_TEST);
	}
};

ToolsModule.registerTool( TestCollisionsTool );


