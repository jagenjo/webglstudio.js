var TextureTools = {
	init: function()
	{
		LiteGUI.menubar.add("Actions/Texture Tools", { callback: function() { 
			TextureTools.showToolsDialog();
		}});
	},

	showToolsDialog: function( texture_name )
	{
		if(this.dialog)
			this.dialog.close();

		var dialog = new LiteGUI.Dialog("dialog_texture_tools", {title:"Texture Tools", close: true, minimize: true, width: 300, height: 440, scroll: false, draggable: true});
		dialog.show('fade');
		dialog.setPosition(100,100);
		this.dialog = dialog;

		var widgets = new LiteGUI.Inspector("texture_tools",{ name_width: "50%" });
		widgets.onchange = function()
		{
			RenderModule.requestFrame();
		}

		inner_update();

		function inner_update()
		{
			var texture = null;
			if( texture_name )
				texture = LS.ResourcesManager.getMesh( texture_name );

			widgets.clear();

			widgets.addTexture("Texture", texture_name || "", { callback: function(v) {
				texture_name = v;
				inner_update();
			}, callback_load: function( res ){
				texture_name = res.filename;
				inner_update();
			}});

			if(texture)
			{
				texture.inspect( widgets, true );
			}
			else
			{
				if(LS.ResourcesManager.isLoading( texture ))
					widgets.addInfo(null, "Loading...");
			}

			widgets.addSeparator();
			widgets.addButton("", "Close" , { callback: function (value) { 
				dialog.close(); 
			}});
			dialog.adjustSize();

		}//inner update

		dialog.add( widgets );
		dialog.adjustSize();		
	},

	showApplyShaderDialog: function( texture )
	{
		if(!texture)
			return;

		var filename = "";
		if(texture)
			filename = texture.fullpath || texture.filename;

		var dialog = new LiteGUI.Dialog("dialog_texture_apply_shader", {title:"Apply Shader", close: true, minimize: true, width: 300, height: 440, scroll: false, draggable: true});
		dialog.show('fade');
		dialog.setPosition(100,100);

		var widgets = new LiteGUI.Inspector("apply_shader_tools",{ name_width: "50%" });
		dialog.add( widgets );

		widgets.addTexture("Texture", filename, { callback: function(v){
			filename = v;
			//reload?
		}});

		var code = "color.xyz = vec3(1.0) - color.xyz";
		widgets.addTitle("Code");
		widgets.addInfo(null,"vec4 color and vec2 uv");
		widgets.addTextarea(null,code,{ height: 100, callback: function(v){
			code = v;
		},callback_keydown: function(e){
			if(e.keyCode == 13 && e.ctrlKey)
			{
				code = e.target.value;
				inner_apply();
				e.preventDefault();
				e.stopPropagation();
			}
		}});

		var error_widget = widgets.addInfo(null," ");

		widgets.addButton(null,"Apply FX", inner_apply );
		widgets.addButton(null,"Restore Original", inner_restore );

		dialog.show();
		dialog.adjustSize();		

		var clone = null;
		var backup = null;
		var shader = null;

		function inner_apply()
		{
			try
			{
				shader = GL.Shader.createFX( code, null, shader );
			}
			catch (err)
			{
				console.error(err);
				error_widget.setValue("Error: " + err );
				return;
			}
			if(!clone)
			{
				clone = texture.clone();
				backup = texture.clone();
			}
			else
				texture.copyTo( clone );
			clone.copyTo( texture, shader );
			LS.RM.resourceModified( texture );
			RenderModule.requestFrame();
		}

		function inner_restore()
		{
			if(!backup)
				return;
			backup.copyTo( texture );
			RenderModule.requestFrame();
		}
	},

	exportToFile: function( texture )
	{
		if(!texture)
			return;
		var file = texture.toBlob();
		LiteGUI.downloadFile("export.png", file );
	}
};

GL.Texture.prototype.inspect = function( widgets, skip_default_widgets )
{
	var texture = this;
	var formats = { 6407: "gl.RGB", 6408: "gl.RGBA", };
	var texture_types = { 3553: "gl.TEXTURE_2D", 34067: "gl.TEXTURE_CUBE_MAP" };
	var types = { 5121: "gl.UNSIGNED_BYTE", 36193: "gl.HALF_FLOAT_OES", 5126: "gl.FLOAT" };

	widgets.addString("Width", texture.width );
	widgets.addString("Height", texture.height );
	widgets.addString("Format", formats[ texture.format ] || "unknown" );
	widgets.addString("Type", types[ texture.type ] || "unknown" );
	widgets.addString("Texture type", texture_types[ texture.texture_type ] || "unknown" );

	widgets.addTitle("Actions");

	widgets.addButton(null, "Apply shader", function(){
		TextureTools.showApplyShaderDialog( texture );
	});
	widgets.addButton(null, "Fill", function(){
		RenderModule.requestFrame();
	});

	if(!skip_default_widgets)
		DriveModule.addResourceInspectorFields( this, widgets );
}

CORE.registerModule( TextureTools );