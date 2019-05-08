//************** BASE TOOLS *******************************


//******* BUTTONS ******************************

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
		RenderModule.requestFrame();
		setTimeout(function(){
			RenderModule.requestFrame();
		},10);
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
	icon: "imgs/mini-icon-film.png",
	enabled: false,
	callback: function()
	{
		RenderModule.auto_render = !RenderModule.auto_render;
	}
};

ToolsModule.registerButton( autorenderEnabledButton );


var showStencilButton = {
	name: "show_stencil",
	description: "Show stencil buffer",
	section: "view-modes",
	icon: "imgs/mini-icon-mask.png",
	enabled: false,
	callback: function()
	{
		RenderModule.show_stencil_mask = RenderModule.show_stencil_mask != -1 ? -1 : 128;
	},

	inspect: function( inspector )
	{
		inspector.addNumber("Stencil Mask Value", RenderModule.show_stencil_mask, { min: 0, max: 256, step: 1, precision:0, callback: function(v){
			RenderModule.show_stencil_mask = v;
		}});
	}
};

ToolsModule.registerButton(showStencilButton);

var showDepthButton = {
	name: "show_depth",
	description: "Show Depth Buffer",
	section: "view-modes",
	icon: "imgs/mini-icon-depth.png",
	enabled: false,
	callback: function()
	{
		RenderModule.show_depth_buffer = !RenderModule.show_depth_buffer;
	}
};

ToolsModule.registerButton(showDepthButton);

var viewSceneCameraButton = {
	name: "view_scene_camera",
	description: "View from Scene Camera",
	section: "view-modes",
	icon: "imgs/mini-icon-camera.png",
	enabled: false,
	callback: function(e)
	{
		//RenderModule.getActiveViewport().showSelectCameraContextMenu( e );
		RenderModule.view_from_scene_cameras = !RenderModule.view_from_scene_cameras;
	}
};

ToolsModule.registerButton( viewSceneCameraButton );


var viewFrameButton = {
	name: "view_safe_frame",
	description: "View Safe Frame",
	section: "view-modes",
	icon: "imgs/mini-icon-frame.png",
	enabled: false,
	callback: function(e)
	{
		RenderModule.view_safe_frame = !RenderModule.view_safe_frame;
	}
};

ToolsModule.registerButton( viewFrameButton );






