var MitsubaTool = {

	name: "mitsubaTool",

	init: function()
	{
		//LiteGUI.menubar.add("Window/Mitsuba", { callback: function() { UnknownMeshTool.showDialog(); }});
	},

	deinit: function()
	{
		//LiteGUI.menubar.remove("Window/unknown Mesh");
	}
};

CORE.registerModule( MitsubaTool );

//Format


var parserMitsubaXML = {
	extension: "xml",
	subextension: "mitsuba",
	type: "scene",
	resource: "SceneNode",
	format: "text",
	dataType:'text',

	parse: function( data, options, filename )
	{
		if(!data || data.constructor !== String)
		{
			console.error("XML parser requires string");
			return null;
		}
	}
}

LS.Formats.addSupportedFormat( "xml", parserMitsubaXML );
