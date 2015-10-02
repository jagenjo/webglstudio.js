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
		RenderModule.render_options.render_fx = !RenderModule.render_options.render_fx;
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
		RenderModule.render_options.lights_disabled = !RenderModule.render_options.lights_disabled;
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



var DebugTool = {
	name: "debug",
	description: "To test features",
	section: "select",
	icon: "imgs/mini-icon-test.png",

	enabled: false,

	click_pos: [0,0],

	onEnable: function()
	{
	},

	onClick: function()
	{
		EditorView.debug_points.length = 0;
	},

	mousedown: function(e) {
		this.click_pos = [e.canvasx,e.canvasy];
	},

	mousemove: function(e) {
		//return;
		
		//test
		var camera = ToolUtils.getCamera();
		var ray = camera.getRayInPixel( e.mousex, gl.canvas.height - e.mousey );
		//ray.end = vec3.add( vec3.create(), ray.start, vec3.scale(vec3.create(), ray.direction, 10000) );
		var collisions = Physics.raycast(Scene, ray.start, ray.direction);

		if(collisions.length)
			EditorView.debug_points.push( collisions[0][1] );

		Scene.refresh();
	},

	mouseup: function(e) {
	}
};

ToolsModule.registerTool(DebugTool);