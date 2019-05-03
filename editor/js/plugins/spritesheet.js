//WORK IN PROGRESS

var SpriteSheets = {

	name: "Spritesheets",
	preferences: {
		frame_width: 64,
		frame_height: 64,
		num_frames_per_anim: 8,
		num_angles: 8,
		alpha_bg: true,
	},

	init: function()
	{
		LiteGUI.menubar.add("Window/Spritesheets", { callback: function() { SpriteSheets.showDialog(); }});
	},

	deinit: function()
	{
		LiteGUI.menubar.remove("Window/Spritesheets");
	},

	showDialog: function()
	{
		var dialog = LiteGUI.Dialog.getDialog("screencapture_panel");
		if(dialog)
		{
			dialog.maximize();
			dialog.highlight(200);
			return;
		}

		dialog = new LiteGUI.Dialog({ title:'Sprite Sheets', fullcontent:true, width: 800, height: 400, closable: true, minimize: true, resizable: true, draggable: true });
		var preferences = this.preferences;

		var area = new LiteGUI.Area(null,{ size: "100%" });
		dialog.add(area);
		area.split("horizontal",[200,null]);
		area.root.style.height = "calc( 100% - 20px )";

		var inspector = new LiteGUI.Inspector();
		inspector.addTitle("Properties");
		inspector.addNumber("Frame Width", preferences.frame_width, { step:1, min: 8, precision:0, callback: function(v){ preferences.frame_width = v; }});
		inspector.addNumber("Frame Height", preferences.frame_height, { step:1, min: 8, precision:0, callback: function(v){ preferences.frame_height = v; }});
		inspector.addNumber("Frames per animation", preferences.num_frames_per_anim, { step:1, min: 2, precision:0, callback: function(v){ preferences.num_frames_per_anim = v; }});
		inspector.addNumber("Num angles", preferences.num_angles, { step:1, min: 1, precision:0, callback: function(v){ preferences.num_angles = v; }});
		inspector.addCheckbox("Alpha bg.", preferences.alpha_bg, { callback: function(v){ preferences.alpha_bg = v; }});

		inspector.addButton(null,"Generate", function(){
			var node = SelectionModule.getSelectedNode();
			if(!node)
			{
				LiteGUI.alert("no node selected");
				return;
			}
			var playanim = node.getComponent("PlayAnimation");
			if(!playanim)
			{
				LiteGUI.alert("no play animation in node selected");
				return;
			}
			var take = playanim.getTake();
			if(!take)
			{
				LiteGUI.alert("no animation or take in play animation");
				return;
			}
			SpriteSheets.generate( playanim, preferences.frame_width, preferences.frame_height, preferences.num_frames_per_anim, preferences.num_angles, preferences.alpha_bg ? [0,0,0,0] : [1,0,1,1], inner_ready );
		});

		var info_widget = inspector.addInfo(null,"Click Generate");

		area.getSection(0).add( inspector );

		var captureArea = area.getSection(1).content;
		captureArea.style.backgroundColor = "black";
		captureArea.style.overflow = "auto";
		dialog.show();

		function inner_ready( texture )
		{
			var canvas = texture.toCanvas(null,true);
			canvas.toBlob(inner_show, 'image/png');
		}

		function inner_show( blob )
		{
			var url = URL.createObjectURL( blob );
			var img = new Image();
			img.setAttribute("download","screen.png");
			img.src = url;
			info_widget.setValue("<a href='"+url+"' download='screenshot.png'>Download File</a>");
			//img.width = "100%";
			captureArea.innerHTML = ""
			captureArea.appendChild( img );
		}
	},

	generate: function( playanim, frame_width, frame_height, num_frames, num_views, bg_color, on_ready )
	{
		bg_color = bg_color || [0,0,0,0];
		var atlas_texture = new GL.Texture( frame_width * num_frames, frame_height * num_views, { format: gl.RGBA });
		var camera = RenderModule.getActiveCamera();
		var offset_view = 360 / num_views;
		var take = playanim.getTake();
		var duration = take.duration;
		var offset_time = duration / num_frames;
		var render_settings = RenderModule.render_settings;
		render_settings.ignore_clear = true;

		atlas_texture.drawTo(function(){
			gl.clearColor(bg_color[0],bg_color[1],bg_color[2],bg_color[3]);
			gl.clear( GL.COLOR_BUFFER_BIT | GL.DEPTH_BUFFER_BIT );
			for(var i = 0; i < num_views; ++i)
			{
				camera.orbit( offset_view, [0,1,0] );
				for(var j = 0; j < num_frames; ++j)
				{
					var time = j * offset_time;
					playanim.applyAnimation( take, time, time - offset_time );
					LS.Renderer.setFullViewport(j*frame_width, i*frame_height, frame_width, frame_height );
					LS.Renderer.renderFrame(camera, render_settings, LS.GlobalScene );
				}
			}
		});

		render_settings.ignore_clear = false;
		LS.Renderer.setFullViewport();

		if(on_ready)
			on_ready( atlas_texture );
		return atlas_texture;
	}
};

CORE.registerPlugin( SpriteSheets );

