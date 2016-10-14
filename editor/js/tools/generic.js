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

var guiEnabledButton = {
	name: "gui",
	description: "Show GUI in editor",
	section: "visibility",
	icon: "imgs/mini-icon-gui.png",
	enabled: true,
	callback: function()
	{
		RenderModule.render_settings.render_gui = !RenderModule.render_settings.render_gui;
	}
};

ToolsModule.registerButton( guiEnabledButton );

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






